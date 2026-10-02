// scripts/card-assets/seed-local-rarity-boxes.mjs
//
// Renseigne `geometry.boxes.rarity` sur la base LOCALE : l'emplacement déclaré
// du symbole d'extension, lu dans le bloc `rarity:` du style MSE.
//
// Pourquoi : ce bloc était lu pour sa seule LARGEUR (`card_style.rarity.
// content_width`, cf. scripts/mse-geometry/style-file.ts) et sa boîte n'était
// pas publiée. Sans elle, un gabarit sans bandeau mesuré — ceux dont la ligne de
// type est ancrée `middle`, ignorés par seed-local-text-bars.mjs — n'avait aucun
// repère pour le symbole et retombait sur le bord droit de la boîte de type. Or
// MSE rétrécit cette boîte de la largeur du symbole pour lui réserver sa place :
// ce bord est le bord GAUCHE du slot, donc le symbole atterrissait sur le texte
// de type (~47 u trop à gauche sur magic-old et magic-old-abu).
//
// Script jetable, sur le modèle de seed-local-text-bars.mjs : `npm run
// card-assets` charge .env.seed avec override:true et écrit donc en PRODUCTION,
// ce qu'on ne veut pas ici (cf. docs/card-studio.md § Operational notes).
//
// Ne touche QUE `boxes.rarity` : le reste de la géométrie est relu et réécrit
// tel quel, pour qu'une erreur ici ne puisse pas dégrader une mesure correcte.
//
// Usage : SUPABASE_SERVICE_ROLE_KEY=... node scripts/card-assets/seed-local-rarity-boxes.mjs
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

// Même source que `npm run mse:geometry` : la boîte publiée est celle que
// l'extracteur résout, pas une relecture parallèle du corpus.
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
let missing = 0;

for (const row of rows) {
	const geometry = row.geometry;
	if (!geometry?.boxes) continue;

	const rarity = geometries.get(row.id)?.boxes?.rarity;
	// Un gabarit dont le bloc `rarity:` ne se résout pas garde sa géométrie telle
	// quelle : pas de boîte inventée, le canvas retombera sur son bandeau mesuré.
	if (!rarity) {
		missing += 1;
		continue;
	}

	const response = await fetch(
		`${URL_BASE}/rest/v1/card_templates?id=eq.${encodeURIComponent(row.id)}`,
		{
			method: 'PATCH',
			headers: { ...headers, Prefer: 'return=minimal' },
			body: JSON.stringify({
				geometry: { ...geometry, boxes: { ...geometry.boxes, rarity } },
			}),
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
	`patched ${patched} gabarits, ${missing} sans bloc rarity resolu, sur ${rows.length} lus`
);
