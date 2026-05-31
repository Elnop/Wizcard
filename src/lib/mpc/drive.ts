import type { DriveFileRaw, MpcCard } from './types';

const KNOWN_SUFFIXES = [
	'Extended',
	'Borderless',
	'Alt Art',
	'Showcase',
	'Retro',
	'Promo',
	'Foil',
	'Etched',
	'Full Art',
];

function normalizeName(filename: string): string {
	const dot = filename.lastIndexOf('.');
	let name = dot !== -1 ? filename.slice(0, dot) : filename;
	for (const suffix of KNOWN_SUFFIXES) {
		name = name.replace(` (${suffix})`, '').replace(` (${suffix.toLowerCase()})`, '');
	}
	return name.trim();
}

function driveThumbUrl(fileId: string): string {
	return `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`;
}

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);

function isImageFile(filename: string): boolean {
	const dot = filename.lastIndexOf('.');
	if (dot === -1) return false;
	return IMAGE_EXTENSIONS.has(filename.slice(dot + 1).toLowerCase());
}

export async function fetchDriveFolder(folderId: string): Promise<MpcCard[]> {
	const res = await fetch(`/api/drive/${encodeURIComponent(folderId)}`);
	if (!res.ok) throw new Error(`Drive fetch failed: ${res.status}`);
	const files = (await res.json()) as DriveFileRaw[];
	return files
		.filter((f) => isImageFile(f.name))
		.map((f) => ({
			id: f.id,
			name: normalizeName(f.name),
			sourceId: folderId,
			imageUrl: driveThumbUrl(f.id),
			isCustom: true as const,
		}));
}
