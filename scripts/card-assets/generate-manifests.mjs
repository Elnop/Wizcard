import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ASSET_VERSION = 'bcdf4190b4bf';
const SNAPSHOT_ROOT = `card-assets/v/${ASSET_VERSION}/full-magic-pack`;
const PUBLIC_ROOT = path.resolve('public');
const DATA_ROOT = path.join(PUBLIC_ROOT, SNAPSHOT_ROOT, 'data');
const MANIFEST_ROOT = path.join(PUBLIC_ROOT, 'card-assets', 'manifests');
const IMAGE_EXTENSIONS = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp']);
const FRAME_FILE_STEMS = {
	light: ['wcard', 'whitecard', 'wframe', 'whiteframe'],
	tide: ['ucard', 'bluecard', 'uframe', 'blueframe'],
	void: ['bcard', 'blackcard', 'bframe', 'blackframe'],
	ember: ['rcard', 'redcard', 'rframe', 'redframe'],
	grove: ['gcard', 'greencard', 'gframe', 'greenframe'],
	prismatic: ['mcard', 'goldcard', 'multicard', 'mframe', 'goldframe'],
	artifact: ['acard', 'ccard', 'artifactcard', 'colorlesscard', 'aframe', 'cframe'],
};
const frameColorCache = new Map();

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

function classify(id, name) {
	const haystack = `${id} ${name}`.toLowerCase();
	if (/token|emblem/.test(haystack)) return 'token';
	if (/planeswalker/.test(haystack)) return 'planeswalker';
	if (/saga/.test(haystack)) return 'saga';
	if (/split|aftermath/.test(haystack)) return 'split';
	if (/double|transform|flip|meld/.test(haystack)) return 'double-faced';
	if (/planechase|planar|scheme|vanguard/.test(haystack)) return 'oversized';
	if (/booster|box|pack|wrapper/.test(haystack)) return 'packaging';
	return 'card';
}

async function resolveFramePaths(source, styleDirectory) {
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

async function buildTemplate(styleDirectory) {
	const stylePath = path.join(styleDirectory, 'style');
	const source = (await fs.readFile(stylePath, 'utf8')).replace(/^\uFEFF/, '');
	const directory = normalize(path.relative(DATA_ROOT, styleDirectory));
	const id = path.basename(styleDirectory, '.mse-style');
	const name = topLevelValue(source, 'full name') ?? topLevelValue(source, 'short name') ?? id;
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
		shortName: topLevelValue(source, 'short name'),
		directory,
		stylePath: `${SNAPSHOT_ROOT}/data/${directory}/style`,
		samplePath: sample ? `${SNAPSHOT_ROOT}/data/${directory}/${sample}` : null,
		iconPath:
			icon && ownRelativeFiles.includes(icon) ? `${SNAPSHOT_ROOT}/data/${directory}/${icon}` : null,
		kind: classify(id, name),
		orientation,
		dimensions: { width, height, dpi: numericValue(source, 'card dpi') },
		installerGroup,
		dependencies,
		assetCount: ownFiles.length,
		framePaths,
		frameTextColors,
		sampleTextColors,
		renderMode: Object.keys(framePaths).length >= 3 ? 'frame' : 'sample',
		version: topLevelValue(source, 'version'),
	};
}

await fs.mkdir(MANIFEST_ROOT, { recursive: true });

const dataEntries = await fs.readdir(DATA_ROOT, { withFileTypes: true });
const styleDirectories = dataEntries
	.filter((entry) => entry.isDirectory() && entry.name.endsWith('.mse-style'))
	.map((entry) => path.join(DATA_ROOT, entry.name))
	.sort((left, right) => left.localeCompare(right));

const templates = await mapWithConcurrency(styleDirectories, 8, buildTemplate);
const allFiles = (await walk(path.join(PUBLIC_ROOT, SNAPSHOT_ROOT))).sort((left, right) =>
	left.localeCompare(right)
);
const assets = await Promise.all(
	allFiles.map(async (file) => {
		const stats = await fs.stat(file);
		return { path: normalize(path.relative(PUBLIC_ROOT, file)), size: stats.size };
	})
);

const generatedAt = new Date().toISOString();
const totalBytes = assets.reduce((sum, asset) => sum + asset.size, 0);
const byKind = Object.fromEntries(
	Object.entries(Object.groupBy(templates, (template) => template.kind)).map(([kind, entries]) => [
		kind,
		entries.length,
	])
);
const shared = {
	schemaVersion: 1,
	assetVersion: ASSET_VERSION,
	generatedAt,
	upstream: {
		repository: 'https://github.com/MagicSetEditorPacks/Full-Magic-Pack',
		commit: ASSET_VERSION,
	},
};

await fs.writeFile(
	path.join(MANIFEST_ROOT, 'templates.json'),
	`${JSON.stringify({ ...shared, stats: { templates: templates.length, byKind }, templates }, null, 2)}\n`
);
await fs.writeFile(
	path.join(MANIFEST_ROOT, 'assets.json'),
	`${JSON.stringify({ ...shared, stats: { files: assets.length, bytes: totalBytes }, assets })}\n`
);

console.log(
	`Generated ${templates.length} templates and indexed ${assets.length} files (${totalBytes} bytes).`
);
