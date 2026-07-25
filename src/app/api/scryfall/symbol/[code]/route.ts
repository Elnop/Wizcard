import { NextResponse } from 'next/server';

/**
 * Sert un symbole de mana Scryfall depuis NOTRE origine.
 *
 * Pourquoi ce proxy : svgs.scryfall.io ne renvoie pas d'en-tête
 * `Access-Control-Allow-Origin`. Les <img>/<image> s'affichent quand même (une
 * image cross-origin n'exige pas CORS), mais l'export PNG du studio doit LIRE
 * ces SVG pour les inliner en data-URI avant de rasteriser — et là, `fetch`
 * échoue (« Failed to fetch »), ce qui faisait planter tout l'export.
 *
 * Ce n'est PAS un proxy d'images ouvert : le code demandé est validé contre une
 * regex stricte et réinjecté dans une URL construite ici, donc rien d'arbitraire
 * ne peut être récupéré à travers cette route.
 */

// Codes réellement servis par Scryfall : lettres, chiffres, et les séparateurs
// des symboles composés — hybrides ({W/U} -> WU), phyrexians ({U/P} -> UP),
// génériques hybrides ({2/R} -> 2R), Tap/Untap (T, Q), neige (S), infini (∞).
// La barre oblique n'apparaît pas dans les noms de fichiers Scryfall.
const SYMBOL_CODE = /^[A-Z0-9]{1,4}$/;

// Immuables : un symbole donné ne change jamais de dessin.
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
	const { code: raw } = await params;
	const code = decodeURIComponent(raw).toUpperCase();

	if (!SYMBOL_CODE.test(code)) {
		return NextResponse.json({ error: 'Invalid symbol code' }, { status: 400 });
	}

	const upstream = await fetch(`https://svgs.scryfall.io/card-symbols/${code}.svg`, {
		headers: { Accept: 'image/svg+xml' },
		// Le CDN Scryfall est stable : on laisse Next mettre en cache côté serveur.
		next: { revalidate: 60 * 60 * 24 * 30 },
	});

	if (!upstream.ok) {
		// Drainer le corps : une réponse non lue laisse fuir de la RSS native
		// (même piège que le worker d'enrichissement Scryfall).
		await upstream.body?.cancel();
		return NextResponse.json({ error: 'Symbol not found' }, { status: 404 });
	}

	return new NextResponse(await upstream.arrayBuffer(), {
		headers: {
			'Content-Type': 'image/svg+xml; charset=utf-8',
			'Cache-Control': CACHE_CONTROL,
		},
	});
}
