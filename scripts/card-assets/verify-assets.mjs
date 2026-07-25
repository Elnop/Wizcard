// Vérifie l'intégrité du pack LOCAL avant upload : chaque chemin annoncé par le
// manifeste existe-t-il vraiment sur le disque ?
//
//   npm run card-assets:verify
//
// Les assets vivent dans assets/card-templates/ (gitignoré), pas dans public/.
// Volontairement sans compte attendu codé en dur : le pack amont évolue, et un
// seuil figé ferait échouer une mise à jour légitime. On vérifie la cohérence
// interne (manifeste ↔ disque), pas une taille de pack particulière.

import { promises as fs } from 'node:fs';
import path from 'node:path';

const ASSETS_ROOT = path.resolve('assets/card-templates');
const MANIFEST_DIR = path.join(ASSETS_ROOT, 'manifests');

async function readManifest(name) {
	try {
		return JSON.parse(await fs.readFile(path.join(MANIFEST_DIR, name), 'utf8'));
	} catch {
		console.error(
			`Manifeste introuvable : ${path.join(MANIFEST_DIR, name)}\n` +
				`Lancer d'abord : npm run card-assets:manifests`
		);
		process.exit(1);
	}
}

const templatesManifest = await readManifest('templates.json');
const assetsManifest = await readManifest('assets.json');

const failures = [];
const warnings = [];

if (templatesManifest.schemaVersion !== 1)
	failures.push(`schemaVersion ${templatesManifest.schemaVersion} inattendue (attendu 1)`);
if (!Array.isArray(templatesManifest.templates) || templatesManifest.templates.length === 0)
	failures.push('aucun template dans le manifeste');

async function exists(relative) {
	try {
		await fs.access(path.join(ASSETS_ROOT, relative));
		return true;
	} catch {
		return false;
	}
}

for (const template of templatesManifest.templates) {
	// Le style n'est pas uploadé (il n'est pas servi au client), mais son
	// absence signale un pack tronqué.
	if (template.stylePath && !(await exists(template.stylePath)))
		warnings.push(`style absent : ${template.stylePath}`);

	// Sample et frames SONT servis : leur absence dégrade le rendu.
	if (template.samplePath && !(await exists(template.samplePath)))
		failures.push(`sample absent : ${template.samplePath}`);

	for (const framePath of Object.values(template.framePaths ?? {})) {
		// Les frames des modules .mse-include peuvent manquer du pack : c'est
		// toléré (le template retombe sur son sample), mais on le signale.
		if (!(await exists(framePath))) warnings.push(`frame absente : ${framePath}`);
	}

	if (template.renderMode === 'frame' && Object.keys(template.framePaths ?? {}).length === 0)
		failures.push(`${template.id} annonce renderMode=frame sans aucune frame`);
}

const accurate = templatesManifest.templates.filter(
	(template) => template.source === 'cardconjurer' && template.quality === 'accurate'
);

console.log(
	`Pack : ${templatesManifest.templates.length} templates ` +
		`(${accurate.length} accurate), ${assetsManifest.assets?.length ?? 0} fichiers indexés, ` +
		`version ${templatesManifest.assetVersion}.`
);

if (warnings.length) {
	console.warn(`\n${warnings.length} avertissement(s) — templates dégradés mais utilisables :`);
	console.warn(warnings.slice(0, 10).join('\n'));
	if (warnings.length > 10) console.warn(`… et ${warnings.length - 10} de plus.`);
}

if (failures.length) {
	console.error(`\n${failures.length} erreur(s) :`);
	console.error(failures.slice(0, 20).join('\n'));
	process.exitCode = 1;
} else {
	console.log('\nPack cohérent ✔');
}
