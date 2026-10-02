import { NextResponse } from 'next/server';
import { getCardById } from '@/lib/card/source';
import { deriveArtCropUrl } from '@/lib/deck/utils/derive-art-crop';

/**
 * Sert l'illustration d'une carte du catalogue depuis NOTRE origine.
 *
 * Pourquoi ce proxy — exactement la même raison que `/api/scryfall/symbol/[code]` :
 * cards.scryfall.io ne renvoie pas d'en-tête `Access-Control-Allow-Origin`. Une
 * image cross-origin s'AFFICHE sans CORS, donc l'aperçu du studio marcherait
 * sans rien faire. Mais l'export PNG doit LIRE l'illustration pour l'inliner en
 * data-URI avant de rasteriser (cf. `inlineSvgImages`, card-editor/export.ts) —
 * et là `fetch` échoue, ce qui fait tomber tout l'export. Une carte importée
 * serait donc éditable mais pas exportable.
 *
 * Ce n'est PAS un proxy d'images ouvert : la route prend un IDENTIFIANT de carte
 * et un index de face, jamais une URL. L'URL amont est résolue ici, à partir du
 * catalogue. Rien d'arbitraire ne peut être récupéré à travers cette route.
 */

// Les id de print Scryfall sont des UUID. On valide la forme avant d'aller en
// base : une chaîne libre n'a rien à faire dans une requête, même paramétrée.
const CARD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Le studio ne connaît que le recto et le verso.
const FACE_INDEXES = new Set(['0', '1']);

// Le seul hôte d'où Scryfall sert les illustrations (cf. `deriveArtCropUrl`,
// qui refuse déjà de réécrire une URL d'un autre hôte).
const ALLOWED_IMAGE_HOSTS = new Set(['cards.scryfall.io']);

// L'illustration d'un print donné ne change pas.
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

/**
 * Cloudflare, devant cards.scryfall.io, REJETTE l'User-Agent par défaut d'undici
 * (400 « Bad Request », corps JSON) — mesuré : même URL, 400 sans en-tête et 200
 * avec. Sans cette ligne la route ne renvoie jamais d'image, et l'échec a le
 * goût d'une carte sans illustration plutôt que d'un blocage.
 *
 * Même en-tête que les autres lectures serveur d'images Scryfall du projet
 * (deck.server.ts, opengraph-image.tsx).
 */
const UPSTREAM_USER_AGENT = 'Mozilla/5.0 (compatible; WizcardBot/1.0; +https://wizcard.xyz)';

function badRequest(message: string) {
	return NextResponse.json({ error: message }, { status: 400 });
}

function noArtwork() {
	return NextResponse.json({ error: 'No artwork for this card' }, { status: 404 });
}

/**
 * URL amont à récupérer, ou `null` si la carte n'en offre aucune d'exploitable.
 *
 * Le contrôle d'hôte est le dernier verrou de la route : même si une ligne du
 * catalogue portait une URL inattendue, `fetch` ne la suivrait pas.
 */
function resolveUpstreamUrl(artUrl: string | null): URL | null {
	if (!artUrl) return null;
	try {
		const url = new URL(artUrl);
		return ALLOWED_IMAGE_HOSTS.has(url.hostname) ? url : null;
	} catch {
		return null;
	}
}

export async function GET(
	_req: Request,
	{ params }: { params: Promise<{ id: string; face: string }> }
) {
	const { id, face } = await params;

	if (!CARD_ID.test(id)) return badRequest('Invalid card id');
	if (!FACE_INDEXES.has(face)) return badRequest('Invalid face index');

	// `getCardById` (catalogue PUIS Scryfall), et non le lecteur de catalogue seul :
	// le studio importe depuis la recherche, qui atteint des prints que le
	// catalogue local n'a pas encore vus. Mesuré : sur « Le Huitième Docteur »
	// (who/124, fr) la route répondait « Card not found » alors que Scryfall
	// expose bien son `art_crop` — l'illustration manquait sans que rien ne soit
	// cassé en aval. C'est le même repli que tout le reste du domaine carte.
	let card: Awaited<ReturnType<typeof getCardById>> | null = null;
	try {
		card = await getCardById(id);
	} catch {
		// Absente des deux sources : `getCardById` propage l'erreur Scryfall. Le
		// 404 reste la bonne réponse, et l'appelant la traite déjà comme « pas
		// d'illustration ».
		card = null;
	}
	if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 });

	// Une face porte ses propres images quand la carte en a plusieurs (recto et
	// verso ont des illustrations différentes) ; sinon celles de la carte.
	const images = card.card_faces?.[Number(face)]?.image_uris ?? card.image_uris;

	// `art_crop` d'abord, puis dérivation. Le seed le stocke désormais
	// (scripts/seed/normalize-catalog-card.ts), mais les lignes écrites par un
	// seed antérieur ne portent que small/normal/large — même repli que les
	// couvertures de deck (cover-art-catalog.ts).
	const artUrl =
		images?.art_crop ?? deriveArtCropUrl(images?.normal ?? images?.large ?? images?.small ?? null);

	const upstreamUrl = resolveUpstreamUrl(artUrl);
	if (!upstreamUrl) return noArtwork();

	const upstream = await fetch(upstreamUrl, {
		headers: { Accept: 'image/*', 'User-Agent': UPSTREAM_USER_AGENT },
		next: { revalidate: 60 * 60 * 24 * 30 },
	});

	if (!upstream.ok) {
		// Drainer le corps : une réponse non lue laisse fuir de la RSS native
		// (même piège que le worker d'enrichissement Scryfall et que la route des
		// symboles).
		await upstream.body?.cancel();
		return NextResponse.json({ error: 'Artwork not found' }, { status: 404 });
	}

	return new NextResponse(await upstream.arrayBuffer(), {
		headers: {
			'Content-Type': upstream.headers.get('content-type') ?? 'image/jpeg',
			'Cache-Control': CACHE_CONTROL,
		},
	});
}
