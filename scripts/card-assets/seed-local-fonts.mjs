// scripts/card-assets/seed-local-fonts.mjs
//
// Renseigne `geometry.fonts` et `geometry.layout` sur la base LOCALE, à partir
// du corpus MSE.
// Script jetable, sur le modèle de seed-local-crowns.mjs : `npm run card-assets`
// charge .env.seed avec override:true et écrit donc en PRODUCTION, ce qu'on ne
// veut pas ici (cf. docs/card-studio.md § Operational notes).
//
// Ne touche QUE les clés `fonts` et `layout` : les boîtes et l'AST déjà
// stockés sont relus et réécrits tels quels, pour qu'une erreur ici ne puisse
// pas dégrader une géométrie correcte.
//
// Usage : SUPABASE_SERVICE_ROLE_KEY=... node scripts/card-assets/seed-local-fonts.mjs
import { extractAll } from '../mse-geometry/extract.ts';

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

const { geometries } = extractAll(CORPUS_ROOT);

const listed = await fetch(`${URL_BASE}/rest/v1/card_templates?select=id,geometry&limit=1000`, {
	headers,
});
if (!listed.ok) {
	console.error('lecture impossible', listed.status, await listed.text());
	process.exit(1);
}
const rows = await listed.json();

let patched = 0;
let withFonts = 0;
for (const row of rows) {
	const measured = geometries.get(row.id);
	// Pas de géométrie mesurée, ou pas de géométrie stockée : rien à enrichir.
	// On ne CRÉE pas de géométrie ici, ce n'est pas le rôle de ce script.
	if (!measured || !row.geometry) continue;
	const fonts = measured.fonts ?? {};
	const layout = measured.layout ?? {};
	if (Object.keys(fonts).length === 0 && Object.keys(layout).length === 0) continue;

	const response = await fetch(
		`${URL_BASE}/rest/v1/card_templates?id=eq.${encodeURIComponent(row.id)}`,
		{
			method: 'PATCH',
			headers: { ...headers, Prefer: 'return=minimal' },
			body: JSON.stringify({ geometry: { ...row.geometry, fonts, layout } }),
		}
	);
	if (!response.ok) {
		console.error(row.id, response.status, await response.text());
		process.exit(1);
	}
	// Drain the body so the socket is released (cf. mémoire project_scryfall_body_drain).
	await response.body?.cancel();
	patched += 1;
	if (Object.keys(fonts).length === 4) withFonts += 1;
}
console.log(`patched ${patched} rows (${withFonts} avec les 4 polices) sur ${rows.length} lues`);
