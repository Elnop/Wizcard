// scripts/card-assets/seed-local-facets.mjs
//
// Renseigne installer_group / position_hint / tags sur la base LOCALE, à partir
// du manifeste. Script jetable : `npm run card-assets` charge .env.seed avec
// override:true et écrit donc en PRODUCTION, ce qu'on ne veut pas ici.
//
// Usage : node scripts/card-assets/seed-local-facets.mjs
import fs from 'node:fs';

const URL_BASE = 'http://127.0.0.1:54321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) {
	console.error('SUPABASE_SERVICE_ROLE_KEY manquant. Récupère-le via `npx supabase status`.');
	process.exit(1);
}

const manifest = JSON.parse(
	fs.readFileSync('assets/card-templates/manifests/templates.json', 'utf8')
);
const templates = Array.isArray(manifest) ? manifest : manifest.templates;

let updated = 0;
for (const template of templates) {
	const response = await fetch(
		`${URL_BASE}/rest/v1/card_templates?id=eq.${encodeURIComponent(template.id)}`,
		{
			method: 'PATCH',
			headers: {
				apikey: SERVICE_KEY,
				Authorization: `Bearer ${SERVICE_KEY}`,
				'Content-Type': 'application/json',
				Prefer: 'return=minimal',
			},
			body: JSON.stringify({
				installer_group: template.installerGroup ?? null,
				position_hint: template.positionHint ?? null,
				tags: template.tags ?? [],
			}),
		}
	);
	if (!response.ok) {
		console.error(template.id, response.status, await response.text());
		process.exit(1);
	}
	// Drain the body so the socket is released (cf. mémoire project_scryfall_body_drain).
	await response.body?.cancel();
	updated += 1;
}
console.log(`patched ${updated} rows`);
