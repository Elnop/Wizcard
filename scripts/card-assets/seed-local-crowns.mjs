// scripts/card-assets/seed-local-crowns.mjs
//
// Renseigne crown_paths sur la base LOCALE, à partir de la géométrie déjà
// stockée. Script jetable : `npm run card-assets` charge .env.seed avec
// override:true et écrit donc en PRODUCTION, ce qu'on ne veut pas ici.
//
// Usage : node scripts/card-assets/seed-local-crowns.mjs
import { buildCrownPaths } from './crown-compat.mjs';

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

const listed = await fetch(`${URL_BASE}/rest/v1/card_templates?select=id,geometry&limit=1000`, {
	headers,
});
if (!listed.ok) {
	console.error('lecture impossible', listed.status, await listed.text());
	process.exit(1);
}
const rows = await listed.json();

let withCrown = 0;
for (const row of rows) {
	const crownPaths = buildCrownPaths(row.geometry);
	if (crownPaths) withCrown += 1;
	const response = await fetch(
		`${URL_BASE}/rest/v1/card_templates?id=eq.${encodeURIComponent(row.id)}`,
		{
			method: 'PATCH',
			headers: { ...headers, Prefer: 'return=minimal' },
			body: JSON.stringify({ crown_paths: crownPaths }),
		}
	);
	if (!response.ok) {
		console.error(row.id, response.status, await response.text());
		process.exit(1);
	}
	// Drain the body so the socket is released (cf. mémoire project_scryfall_body_drain).
	await response.body?.cancel();
}
console.log(`patched ${rows.length} rows, ${withCrown} with a crown`);
