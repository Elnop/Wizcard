import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ASSET_VERSION } from './asset-version.mjs';
import { extractKeywords } from './frame-keywords.mjs';

const SNAPSHOT_ROOT = `card-assets/v/${ASSET_VERSION}/full-magic-pack`;
const CARD_CONJURER_VERSION = '2fcddba89661';
const CARD_CONJURER_ROOT = `card-assets/v/${CARD_CONJURER_VERSION}/cardconjurer`;
// Les assets ne vivent PAS dans public/ : ~1580 fichiers utiles pour 217 Mo
// (35 030 / 1 Go dans le pack brut) partent vers Supabase Storage via
// upload-templates.ts. La racine ci-dessous est gitignorée — cf. le README du
// dossier pour la procédure de récupération du pack amont.
const PUBLIC_ROOT = path.resolve('assets/card-templates');
const DATA_ROOT = path.join(PUBLIC_ROOT, SNAPSHOT_ROOT, 'data');
const CARD_CONJURER_PUBLIC_ROOT = path.join(PUBLIC_ROOT, CARD_CONJURER_ROOT);
const MANIFEST_ROOT = path.join(PUBLIC_ROOT, 'manifests');
const IMAGE_EXTENSIONS = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp']);
const FRAME_FILE_STEMS = {
	light: ['wcard', 'whitecard', 'wframe', 'whiteframe'],
	tide: ['ucard', 'bluecard', 'uframe', 'blueframe'],
	void: ['bcard', 'blackcard', 'bframe', 'blackframe'],
	ember: ['rcard', 'redcard', 'rframe', 'redframe'],
	grove: ['gcard', 'greencard', 'gframe', 'greenframe'],
	prismatic: ['mcard', 'goldcard', 'multicard', 'mframe', 'goldframe'],
	// `ccard` reste en repli : 1 gabarit du corpus fournit ccard SANS acard, et
	// le retirer le laisserait sans cadre artefact. `acard` d'abord, donc il
	// gagne partout où les deux existent (96 gabarits).
	artifact: ['acard', 'ccard', 'artifactcard', 'colorlesscard', 'aframe', 'cframe'],
	// Incolore, distinct de l'artefact : `ccard` est un gris-brun, `acard` un
	// bleu-métal. `resolveAutomaticFrame` renvoyait `artifact` pour du mana {C},
	// qui est pourtant INCOLORE — cette clé lui donne la bonne cible.
	colorless: ['ccard', 'colorlesscard', 'cframe'],
	// Terrains : même code couleur que ci-dessus, suffixé `l`. Présents sur 73 à
	// 82 des 109 gabarits proposés, en .jpg comme en .png.
	'land-light': ['wlcard'],
	'land-tide': ['ulcard'],
	'land-void': ['blcard'],
	'land-ember': ['rlcard'],
	'land-grove': ['glcard'],
	'land-prismatic': ['mlcard'],
	'land-colorless': ['clcard'],
};
const frameColorCache = new Map();

const CARD_CONJURER_TEMPLATES = [
	{ id: 'regular', name: 'M15 — Accurate', directory: '', layoutId: 'arcana' },
	{ id: 'extended', name: 'M15 — Extended Art', directory: 'extended', layoutId: 'modern' },
	{ id: 'fullart', name: 'M15 — Full Art', directory: 'fullart', layoutId: 'full-art' },
	{ id: 'snow', name: 'Kaldheim — Snow', directory: 'snow', layoutId: 'arcana' },
	{ id: 'nyx', name: 'Theros — Nyx', directory: 'nyx', layoutId: 'arcana' },
	{ id: 'ub', name: 'Universes Beyond', directory: 'ub', layoutId: 'arcana' },
];

const normalize = (value) => value.split(path.sep).join('/');

async function walk(directory) {
	const entries = await fs.readdir(directory, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const absolute = path.join(directory, entry.name);
		if (entry.isDirectory()) files.push(...(await walk(absolute)));
		else if (entry.isFile()) files.push(absolute);
	}
	return files;
}

async function mapWithConcurrency(values, concurrency, operation) {
	const results = new Array(values.length);
	let nextIndex = 0;
	async function worker() {
		while (nextIndex < values.length) {
			const index = nextIndex;
			nextIndex += 1;
			results[index] = await operation(values[index]);
		}
	}
	await Promise.all(Array.from({ length: concurrency }, () => worker()));
	return results;
}

function readableColor(red, green, blue) {
	const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
	return luminance < 118 ? '#f6f1e6' : '#17140d';
}

async function sampleRegionColor(file, xRatio, yRatio) {
	const metadata = await sharp(file).metadata();
	if (!metadata.width || !metadata.height) return '#17140d';
	const width = Math.max(1, Math.round(metadata.width * 0.16));
	const height = Math.max(1, Math.round(metadata.height * 0.025));
	const left = Math.min(metadata.width - width, Math.max(0, Math.round(metadata.width * xRatio)));
	const top = Math.min(metadata.height - height, Math.max(0, Math.round(metadata.height * yRatio)));
	const { data } = await sharp(file)
		.extract({ left, top, width, height })
		.resize(1, 1)
		.removeAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	const red = data[0];
	return readableColor(red, data[1] ?? red, data[2] ?? red);
}

async function analyzeTextColors(file) {
	if (!frameColorCache.has(file)) {
		frameColorCache.set(
			file,
			Promise.all([
				sampleRegionColor(file, 0.2, 0.067),
				sampleRegionColor(file, 0.2, 0.572),
				sampleRegionColor(file, 0.2, 0.73),
				sampleRegionColor(file, 0.2, 0.952),
			]).then(([title, type, rules, footer]) => ({ title, type, rules, footer }))
		);
	}
	return frameColorCache.get(file);
}

function topLevelValue(source, key) {
	const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return source.match(new RegExp(`^${escaped}:\\s*(.+?)\\s*$`, 'mi'))?.[1]?.trim() ?? null;
}

function numericValue(source, key) {
	const value = Number.parseInt(topLevelValue(source, key) ?? '', 10);
	return Number.isFinite(value) ? value : null;
}

async function listCandidateImages(source, styleDirectory) {
	const referencedDirectories = [...source.matchAll(/["']\/(.+?\/)["']/g)]
		.map((match) => match[1])
		.filter((relative) => !relative.includes('..'))
		.map((relative) => path.join(DATA_ROOT, relative));
	const candidateDirectories = [styleDirectory, ...new Set(referencedDirectories)];
	const available = [];

	for (const directory of candidateDirectories) {
		try {
			const entries = await fs.readdir(directory, { withFileTypes: true });
			for (const entry of entries) {
				if (!entry.isFile() || !IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
					continue;
				available.push(path.join(directory, entry.name));
			}
		} catch {
			// Some MSE expressions contain dynamic or optional package paths.
		}
	}

	return available;
}

async function resolveFramePaths(source, styleDirectory) {
	const available = await listCandidateImages(source, styleDirectory);

	return Object.fromEntries(
		Object.entries(FRAME_FILE_STEMS).flatMap(([frame, stems]) => {
			const match = available.find((file) => {
				const stem = path
					.basename(file, path.extname(file))
					.toLowerCase()
					.replaceAll(/[^a-z0-9]/g, '');
				return stems.includes(stem);
			});
			return match ? [[frame, normalize(path.relative(PUBLIC_ROOT, match))]] : [];
		})
	);
}

/**
 * Masques de fondu bicolore, s'ils existent.
 *
 * Ce ne sont PAS des cadres : ce sont des masques quasi-binaires (mesuré : 0,2 à
 * 0,4 % de pixels intermédiaires) que MSE combine avec DEUX cadres colorés, via
 * masked_blend(mask, dark, light). Peint seul, un masque donne une carte
 * blanche — d'où leur stockage à part de framePaths.
 *
 * Seuls les masques `_card` sont retenus : le corpus en fournit aussi pour la
 * P/T, la ligne de type, la zone de texte et le sceau, qui masquent des
 * sous-éléments hors de ce chantier.
 */
const BLEND_MASK_FILES = {
	multicolor: 'multicolor_blend_card.png',
	hybrid: 'hybrid_blend_card.png',
	artifact: 'artifact_blend_card.png',
};

async function resolveBlendMasks(source, styleDirectory) {
	const available = await listCandidateImages(source, styleDirectory);
	const found = Object.fromEntries(
		Object.entries(BLEND_MASK_FILES).flatMap(([key, file]) => {
			const match = available.find((path_) => path_.toLowerCase().endsWith(`/${file}`));
			return match ? [[key, normalize(path.relative(PUBLIC_ROOT, match))]] : [];
		})
	);
	return Object.keys(found).length > 0 ? found : null;
}

async function buildTemplate(styleDirectory) {
	const stylePath = path.join(styleDirectory, 'style');
	const source = (await fs.readFile(stylePath, 'utf8')).replace(/^\uFEFF/, '');
	const directory = normalize(path.relative(DATA_ROOT, styleDirectory));
	const id = path.basename(styleDirectory, '.mse-style');
	const shortName = topLevelValue(source, 'short name');
	const name = topLevelValue(source, 'full name') ?? shortName ?? id;
	const width = numericValue(source, 'card width');
	const height = numericValue(source, 'card height');
	const icon = topLevelValue(source, 'icon');
	const ownFiles = await walk(styleDirectory);
	const ownRelativeFiles = ownFiles.map((file) => normalize(path.relative(styleDirectory, file)));
	const sampleCandidates = ['card-sample.png', icon]
		.filter(Boolean)
		.filter((candidate, index, values) => values.indexOf(candidate) === index);
	const sample =
		sampleCandidates.find((candidate) => ownRelativeFiles.includes(candidate)) ??
		ownRelativeFiles.find((file) => IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase())) ??
		null;
	const dependencies = source
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.toLowerCase().startsWith('package:'))
		.map((line) => line.slice(line.indexOf(':') + 1).trim());
	const installerGroup = topLevelValue(source, 'installer group');
	const framePaths = await resolveFramePaths(source, styleDirectory);
	const frameTextColors = Object.fromEntries(
		await Promise.all(
			Object.entries(framePaths).map(async ([frame, framePath]) => [
				frame,
				await analyzeTextColors(path.join(PUBLIC_ROOT, framePath)),
			])
		)
	);
	const sampleTextColors = sample
		? await analyzeTextColors(path.join(styleDirectory, sample))
		: null;
	let orientation = 'unknown';
	if (width && height) orientation = width > height ? 'landscape' : 'portrait';

	return {
		id,
		name,
		shortName,
		directory,
		stylePath: `${SNAPSHOT_ROOT}/data/${directory}/style`,
		samplePath: sample ? `${SNAPSHOT_ROOT}/data/${directory}/${sample}` : null,
		iconPath:
			icon && ownRelativeFiles.includes(icon) ? `${SNAPSHOT_ROOT}/data/${directory}/${icon}` : null,
		orientation,
		dimensions: { width, height, dpi: numericValue(source, 'card dpi') },
		installerGroup,
		// Ordre déclaré par les auteurs du corpus (001–907). C'est le tri du
		// sélecteur : l'ordre alphabétique précédent éclatait la chronologie des
		// cadres (« 10th edition » sous 1, « After M15 » sous A).
		positionHint: topLevelValue(source, 'position hint'),
		// Tous les mots-clés, toutes sources confondues. Remplace `kind`, dont la
		// cascade de regex produisait des faux positifs (« Textbox » -> packaging)
		// et écrasait la distinction flip / double-face.
		tags: extractKeywords({
			id,
			name,
			shortName,
			installerGroup,
		}),
		dependencies,
		assetCount: ownFiles.length,
		framePaths,
		frameTextColors,
		sampleTextColors,
		blendMasks: await resolveBlendMasks(source, styleDirectory),
		renderMode: Object.keys(framePaths).length >= 3 ? 'frame' : 'sample',
		version: topLevelValue(source, 'version'),
		source: 'mse',
		quality: 'legacy',
	};
}

async function buildCardConjurerTemplate(definition) {
	const relativeDirectory = path.posix.join('img/frames/m15/new', definition.directory);
	const absoluteDirectory = path.join(CARD_CONJURER_PUBLIC_ROOT, relativeDirectory);
	const frameFiles = {
		light: 'w.png',
		tide: 'u.png',
		void: 'b.png',
		ember: 'r.png',
		grove: 'g.png',
		prismatic: 'm.png',
		artifact: 'a.png',
		land: 'l.png',
	};
	const availableFiles = new Set(await fs.readdir(absoluteDirectory));
	const framePaths = Object.fromEntries(
		Object.entries(frameFiles)
			.filter(([, file]) => availableFiles.has(file))
			.map(([frame, file]) => [frame, path.posix.join(CARD_CONJURER_ROOT, relativeDirectory, file)])
	);
	const frameTextColors = Object.fromEntries(
		await Promise.all(
			Object.entries(framePaths).map(async ([frame, framePath]) => [
				frame,
				await analyzeTextColors(path.join(PUBLIC_ROOT, framePath)),
			])
		)
	);
	const thumbnail = availableFiles.has('wThumb.png') ? 'wThumb.png' : 'w.png';

	return {
		id: `cardconjurer-m15-${definition.id}`,
		name: definition.name,
		shortName: definition.name,
		directory: relativeDirectory,
		stylePath: `${CARD_CONJURER_ROOT}/js/frames/groupAccurate.js`,
		samplePath: path.posix.join(CARD_CONJURER_ROOT, relativeDirectory, thumbnail),
		iconPath: null,
		orientation: 'portrait',
		dimensions: { width: 2010, height: 2814, dpi: 600 },
		installerGroup: 'Accurate Frames',
		positionHint: null,
		tags: [],
		dependencies: [],
		assetCount: availableFiles.size,
		framePaths,
		frameTextColors,
		sampleTextColors: frameTextColors.light ?? null,
		blendMasks: null,
		renderMode: 'frame',
		version: CARD_CONJURER_VERSION,
		source: 'cardconjurer',
		quality: 'accurate',
		layoutId: definition.layoutId,
	};
}

await fs.mkdir(MANIFEST_ROOT, { recursive: true });

const dataEntries = await fs.readdir(DATA_ROOT, { withFileTypes: true });
const styleDirectories = dataEntries
	.filter((entry) => entry.isDirectory() && entry.name.endsWith('.mse-style'))
	.map((entry) => path.join(DATA_ROOT, entry.name))
	.sort((left, right) => left.localeCompare(right));

const mseTemplates = await mapWithConcurrency(styleDirectories, 8, buildTemplate);
const cardConjurerTemplates = await Promise.all(
	CARD_CONJURER_TEMPLATES.map(buildCardConjurerTemplate)
);
const templates = [...cardConjurerTemplates, ...mseTemplates];
const allFiles = (
	await Promise.all([
		walk(path.join(PUBLIC_ROOT, SNAPSHOT_ROOT)),
		walk(path.join(PUBLIC_ROOT, CARD_CONJURER_ROOT)),
	])
)
	.flat()
	.sort((left, right) => left.localeCompare(right));
const assets = await Promise.all(
	allFiles.map(async (file) => {
		const stats = await fs.stat(file);
		return { path: normalize(path.relative(PUBLIC_ROOT, file)), size: stats.size };
	})
);

const generatedAt = new Date().toISOString();
const totalBytes = assets.reduce((sum, asset) => sum + asset.size, 0);
const byFamily = Object.fromEntries(
	Object.entries(
		Object.groupBy(
			templates,
			(template) => template.installerGroup?.split('/')[1]?.trim() ?? 'unknown'
		)
	).map(([family, entries]) => [family, entries.length])
);
const shared = {
	schemaVersion: 1,
	assetVersion: `${ASSET_VERSION}+${CARD_CONJURER_VERSION}`,
	generatedAt,
	upstream: {
		repositories: [
			{
				repository: 'https://github.com/MagicSetEditorPacks/Full-Magic-Pack',
				commit: ASSET_VERSION,
			},
			{
				repository: 'https://github.com/Investigamer/cardconjurer',
				commit: CARD_CONJURER_VERSION,
				selection: 'Accurate Frames',
			},
		],
	},
};

await fs.writeFile(
	path.join(MANIFEST_ROOT, 'templates.json'),
	`${JSON.stringify({ ...shared, stats: { templates: templates.length, byFamily }, templates }, null, 2)}\n`
);
await fs.writeFile(
	path.join(MANIFEST_ROOT, 'assets.json'),
	`${JSON.stringify({ ...shared, stats: { files: assets.length, bytes: totalBytes }, assets })}\n`
);

console.log(
	`Generated ${templates.length} templates and indexed ${assets.length} files (${totalBytes} bytes).`
);
