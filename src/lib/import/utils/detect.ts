import type { ImportFormatId } from './types';
import { FORMAT_REGISTRY, BINARY_FORMAT_REGISTRY } from '@/lib/import/formats/registry';

export interface DetectionResult {
	formatId: ImportFormatId;
	scores: Record<ImportFormatId, number>;
}

export function detectBinaryFormat(fileName: string): ImportFormatId | null {
	const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
	for (const descriptor of BINARY_FORMAT_REGISTRY) {
		if (descriptor.fileExtensions.includes(ext)) return descriptor.id;
	}
	return null;
}

export function detectFormat(text: string, fileName?: string): DetectionResult {
	const ext = fileName ? fileName.slice(fileName.lastIndexOf('.')).toLowerCase() : '';

	const scores = {} as Record<ImportFormatId, number>;
	let bestId: ImportFormatId = FORMAT_REGISTRY[0].id;
	let bestScore = -1;

	for (const descriptor of FORMAT_REGISTRY) {
		let score = descriptor.detect(text);
		if (ext && descriptor.fileExtensions.includes(ext)) {
			score = Math.min(score + 0.1, 1);
		}
		scores[descriptor.id] = score;
		if (score > bestScore) {
			bestScore = score;
			bestId = descriptor.id;
		}
	}

	return { formatId: bestId, scores };
}
