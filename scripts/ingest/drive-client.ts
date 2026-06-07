// Google Drive I/O: recursive folder listing, retrying fetch, and folder-path
// metadata extraction (card_type + folder-level tags).

import { config, DRIVE_FILES_URL } from './config';
import type { CardType } from '../../src/lib/mpc/types';
import type { DriveImageEntry } from './types';

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);
// eslint-disable-next-line sonarjs/slow-regex
const FOLDER_BRACKET_RE = /\[([^\]]*)\]/gu;
// eslint-disable-next-line sonarjs/slow-regex
const FOLDER_PAREN_RE = /\(([^)]*)\)/gu;
// eslint-disable-next-line sonarjs/slow-regex
const FOLDER_TAG_SPLIT_RE = /\s*,\s*/u;
const DRIVE_ID_RE = /[?&]id=([a-zA-Z0-9_-]+)|\/folders\/([a-zA-Z0-9_-]+)/;

export function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

export async function fetchWithRetry(url: string, attempt = 0): Promise<Response> {
	const res = await fetch(url);
	if ((res.status === 429 || res.status >= 500) && attempt < 4) {
		const wait = 500 * Math.pow(2, attempt);
		console.warn(`  ⚠ HTTP ${res.status}, retrying in ${wait}ms…`);
		await sleep(wait);
		return fetchWithRetry(url, attempt + 1);
	}
	return res;
}

export function extractDriveId(url: string): string | null {
	const m = DRIVE_ID_RE.exec(url);
	return m ? (m[1] ?? m[2] ?? null) : null;
}

export function isImageFile(filename: string): boolean {
	const dot = filename.lastIndexOf('.');
	if (dot === -1) return false;
	return IMAGE_EXTENSIONS.has(filename.slice(dot + 1).toLowerCase());
}

export function driveImageUrl(fileId: string): string {
	return `https://drive.google.com/thumbnail?id=${fileId}&sz=w600-h840`;
}

interface DriveItem {
	id: string;
	name: string;
	mimeType: string;
}

interface DriveListResponse {
	files: DriveItem[];
	nextPageToken?: string;
}

async function listDriveFolderChildren(folderId: string): Promise<DriveItem[]> {
	const items: DriveItem[] = [];
	let pageToken: string | undefined;

	do {
		const params = new URLSearchParams({
			q: `'${folderId}' in parents`,
			key: config.googleDriveApiKey,
			pageSize: '1000',
			fields: 'nextPageToken,files(id,name,mimeType)',
			...(pageToken ? { pageToken } : {}),
		});

		const res = await fetchWithRetry(`${DRIVE_FILES_URL}?${params}`);

		// Fatal errors — abort early rather than repeating for every source
		if (res.status === 400 || res.status === 401 || res.status === 403) {
			throw new Error(
				`Drive API fatal error (HTTP ${res.status}) for folder ${folderId} — check GOOGLE_DRIVE_API_KEY permissions`
			);
		}
		if (!res.ok) throw new Error(`Drive list failed for folder ${folderId}: HTTP ${res.status}`);

		const data = (await res.json()) as DriveListResponse;
		items.push(...(data.files ?? []));
		pageToken = data.nextPageToken;
	} while (pageToken);

	return items;
}

// Recursively collects all image files under a folder (handles nested subfolders).
// Tracks the folder path so downstream code can infer card_type and folder-level tags.
// Skips folders whose names start with '!' per MPC Autofill spec.
export async function listDriveFolder(folderId: string): Promise<DriveImageEntry[]> {
	const images: DriveImageEntry[] = [];
	const queue: Array<{ id: string; path: string[] }> = [{ id: folderId, path: [] }];

	while (queue.length > 0) {
		const { id: currentId, path: currentPath } = queue.shift()!;
		const children = await listDriveFolderChildren(currentId);

		for (const item of children) {
			if (item.mimeType === 'application/vnd.google-apps.folder') {
				if (!item.name.startsWith('!')) {
					queue.push({ id: item.id, path: [...currentPath, item.name] });
				}
			} else if (isImageFile(item.name)) {
				images.push({ id: item.id, name: item.name, folderPath: currentPath });
			}
		}
	}

	return images;
}

export function folderPathToMeta(folderPath: string[]): {
	cardType: CardType;
	folderTags: string[];
} {
	let cardType: CardType = 'card';
	const folderTags: string[] = [];

	for (const folderName of folderPath) {
		const lower = folderName.toLowerCase();
		if (lower === 'tokens' || lower.startsWith('tokens ') || lower.startsWith('tokens(')) {
			cardType = 'token';
		} else if (lower === 'cardbacks' || lower.startsWith('cardbacks')) {
			cardType = 'cardback';
		}

		// Extract tags from folder name brackets [...]
		FOLDER_BRACKET_RE.lastIndex = 0;
		for (const m of folderName.matchAll(FOLDER_BRACKET_RE)) {
			const parts = m[1].trim().split(FOLDER_TAG_SPLIT_RE).filter(Boolean);
			folderTags.push(...parts);
		}
		// Extract tags from folder name parens (...)
		FOLDER_PAREN_RE.lastIndex = 0;
		for (const m of folderName.matchAll(FOLDER_PAREN_RE)) {
			const v = m[1].trim();
			if (v && !/^\d+$/u.test(v)) folderTags.push(v);
		}
	}

	return { cardType, folderTags };
}
