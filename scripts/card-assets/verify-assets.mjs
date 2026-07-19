import { promises as fs } from 'node:fs';
import path from 'node:path';

const PUBLIC_ROOT = path.resolve('public');
const templatesManifest = JSON.parse(
	await fs.readFile(path.join(PUBLIC_ROOT, 'card-assets/manifests/templates.json'), 'utf8')
);
const assetsManifest = JSON.parse(
	await fs.readFile(path.join(PUBLIC_ROOT, 'card-assets/manifests/assets.json'), 'utf8')
);

const failures = [];
if (templatesManifest.templates.length !== 376)
	failures.push(`expected 376 templates, found ${templatesManifest.templates.length}`);
if (assetsManifest.assets.length < 34_800)
	failures.push(`expected at least 34,800 assets, found ${assetsManifest.assets.length}`);

for (const template of templatesManifest.templates) {
	try {
		await fs.access(path.join(PUBLIC_ROOT, template.stylePath));
	} catch {
		failures.push(`missing style: ${template.stylePath}`);
	}
	if (template.samplePath) {
		try {
			await fs.access(path.join(PUBLIC_ROOT, template.samplePath));
		} catch {
			failures.push(`missing sample: ${template.samplePath}`);
		}
	}
}

if (failures.length) {
	console.error(failures.join('\n'));
	process.exitCode = 1;
} else {
	console.log(
		`Verified ${templatesManifest.templates.length} templates and ${assetsManifest.assets.length} assets.`
	);
}
