// scripts/card-assets/seed-local-text-bars.mjs
//
// Renseigne `geometry.bars` sur la base LOCALE : le bandeau PEINT de chaque
// champ de texte, mesuré dans l'image du cadre (cf. scripts/mse-geometry/text-bar.ts).
//
// Pourquoi : la boîte déclarée par MSE n'est pas le bandeau visible. Elle est
// calée sur le bord porté par l'ancrage, donc y poser le texte le colle contre
// ce bord — ligne de type haute, nom collé en bas — alors que les cartes
// produites par MSE ont ces textes CENTRÉS dans leur panneau.
//
// Script jetable, sur le modèle de seed-local-fonts.mjs : `npm run card-assets`
// charge .env.seed avec override:true et écrit donc en PRODUCTION, ce qu'on ne
// veut pas ici (cf. docs/card-studio.md § Operational notes).
//
// Ne touche QUE la clé `bars` : le reste de la géométrie est relu et réécrit
// tel quel, pour qu'une erreur ici ne puisse pas dégrader une mesure correcte.
//
// Usage : SUPABASE_SERVICE_ROLE_KEY=... node scripts/card-assets/seed-local-text-bars.mjs
import { measureTextBar } from '../mse-geometry/text-bar.ts';

const CORPUS_ROOT = 'assets/card-templates/card-assets/v/bcdf4190b4bf/full-magic-pack/data';
const URL_BASE = 'http://127.0.0.1:54321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) {
	console.error('SUPABASE_SERVICE_ROLE_KEY manquant. Récupère-le via `npx supabase status`.');
	process.exit(1);
}

const headers = {
	apikey: SERVICE_KEY,
	Authorization: `Bearer ${SERVICE_KEY}`,
	'Content-Type': 'application/json',
};

/**
 * Champs dont on mesure le bandeau.
 *
 * `text` (la boîte de règles) en est absent volontairement : son texte se pose
 * en HAUT d'un grand panneau et s'écoule vers le bas sur plusieurs lignes — le
 * centrer verticalement serait faux. Seuls les champs d'UNE ligne posés sur un
 * bandeau sont concernés.
 */
const BAR_FIELDS = ['name', 'type', 'pt'];

/** Racine locale des variantes CardConjurer converties (cf. build-webp.mjs). */
const CC_ROOT = '/home/elthinkbuntu/Documents/wizcard-assets-cardconjurer/out-webp';

/**
 * Fichier LOCAL correspondant à un chemin stocké en base.
 *
 * Deux jeux d'assets cohabitent pendant la migration, et ils ne vivent pas au
 * même endroit sur le disque : le corpus MSE sous `assets/card-templates/…`, les
 * variantes CardConjurer sous `out-webp/<palier>/…`. La mesure lit le fichier
 * directement (elle n'a pas besoin du bucket), donc c'est ici que les deux
 * conventions se rejoignent.
 *
 * Le palier n'a AUCUNE importance pour la mesure : les variantes sont le même
 * cadre à trois tailles, et `measureTextBar` rend ses résultats en unités de
 * style, donc indépendantes de la résolution. On lit `preview`, le plus léger.
 */
function localFileFor(storagePath) {
	if (storagePath.startsWith('cc/')) return `${CC_ROOT}/${storagePath.slice('cc/'.length)}`;
	return `${CORPUS_ROOT}/${storagePath.replace(/^card-assets\/v\/[^/]+\/full-magic-pack\/data\//, '')}`;
}

const listed = await fetch(
	`${URL_BASE}/rest/v1/card_templates?select=id,geometry,frame_paths&limit=1000`,
	{ headers }
);
if (!listed.ok) {
	console.error('lecture impossible', listed.status, await listed.text());
	process.exit(1);
}
const rows = await listed.json();

let patched = 0;
let measuredFields = 0;
let skippedMiddle = 0;

for (const row of rows) {
	const geometry = row.geometry;
	if (!geometry?.boxes || !geometry.cardWidth || !geometry.cardHeight) continue;

	// Une image de cadre quelconque du gabarit : toutes les variantes de couleur
	// partagent la même géométrie de panneaux, seule la teinte change.
	const framePath = Object.values(row.frame_paths ?? {})[0];
	if (typeof framePath !== 'string' || !framePath) continue;

	const bars = {};
	for (const field of BAR_FIELDS) {
		const box = geometry.boxes[field];
		if (!box) continue;
		// La mesure ne sert QUE les champs ancrés sur un BORD. Un champ `middle`
		// est déjà centré dans sa boîte déclarée, qui est alors le bon repère :
		// lui imposer un bandeau changerait un rendu correct (cf. magic-old, dont
		// la ligne de type n'a d'ailleurs aucun panneau clair à mesurer).
		const anchor = geometry.layout?.[field]?.anchor;
		if (anchor !== 'top' && anchor !== 'bottom') {
			skippedMiddle += 1;
			continue;
		}
		const bar = await measureTextBar(
			localFileFor(framePath),
			box,
			geometry.cardWidth,
			geometry.cardHeight
		);
		if (bar) {
			bars[field] = bar;
			measuredFields += 1;
		}
	}
	if (Object.keys(bars).length === 0) continue;

	const response = await fetch(
		`${URL_BASE}/rest/v1/card_templates?id=eq.${encodeURIComponent(row.id)}`,
		{
			method: 'PATCH',
			headers: { ...headers, Prefer: 'return=minimal' },
			body: JSON.stringify({ geometry: { ...geometry, bars } }),
		}
	);
	if (!response.ok) {
		console.error(row.id, response.status, await response.text());
		process.exit(1);
	}
	// Drain the body so the socket is released (cf. mémoire project_scryfall_body_drain).
	await response.body?.cancel();
	patched += 1;
}

console.log(
	`patched ${patched} gabarits, ${measuredFields} bandeaux mesurés, ` +
		`${skippedMiddle} champs ignorés (ancrage middle) sur ${rows.length} lus`
);
