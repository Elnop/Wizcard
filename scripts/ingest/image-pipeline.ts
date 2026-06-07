// Image pipeline: download Drive image bytes, compute SHA-256, detect duplicate
// images for a source, and mirror to Supabase storage.

import { supabase, flags } from './config';
import { fetchWithRetry, driveImageUrl } from './drive-client';
import type { PendingCard, ImageResult } from './types';

async function fetchImageBytes(fileId: string): Promise<ArrayBuffer | null> {
	try {
		const res = await fetchWithRetry(driveImageUrl(fileId));
		if (!res.ok) return null;
		return await res.arrayBuffer();
	} catch {
		return null;
	}
}

async function computeSHA256Hex(buf: ArrayBuffer): Promise<string> {
	const hashBuf = await crypto.subtle.digest('SHA-256', buf);
	return Array.from(new Uint8Array(hashBuf))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

async function uploadToStorage(
	sourceKey: string,
	driveFileId: string,
	ext: string,
	bytes: ArrayBuffer
): Promise<string | null> {
	const path = `mpc/${sourceKey}/${driveFileId}.${ext}`;
	const { error } = await supabase.storage
		.from('custom-cards')
		.upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
	if (error) return null;
	return path;
}

export async function processCardImage(
	p: PendingCard,
	sourceId: string,
	sourceKey: string
): Promise<ImageResult> {
	const warnings: string[] = [];
	let imageHash: string | null = null;
	let storagePath: string | null = null;
	let imagesMirrored = 0;

	const imageBytes = await fetchImageBytes(p.file.id);
	if (!imageBytes) {
		warnings.push(`Image fetch failed for ${p.cardId}`);
		return { imageHash, storagePath, isDuplicate: false, imagesMirrored, warnings };
	}

	if (flags.checkImageHash) {
		imageHash = await computeSHA256Hex(imageBytes);
		const { data: dup } = await supabase
			.from('custom_cards')
			.select('id')
			.eq('source_id', sourceId)
			.eq('image_hash', imageHash)
			.neq('id', p.cardId)
			.limit(1)
			.maybeSingle();
		if (dup) {
			const msg = `Duplicate image detected for ${p.cardId} (same hash as ${(dup as { id: string }).id})`;
			warnings.push(msg);
			return { imageHash, storagePath, isDuplicate: true, imagesMirrored, warnings };
		}
	}

	if (flags.mirrorImages && !p.alreadyMirrored) {
		const ext = p.parsed.extension ?? 'jpg';
		storagePath = await uploadToStorage(sourceKey, p.file.id, ext, imageBytes);
		if (storagePath) {
			imagesMirrored++;
		} else {
			warnings.push(`Storage upload failed for ${p.cardId}`);
		}
	}

	return { imageHash, storagePath, isDuplicate: false, imagesMirrored, warnings };
}
