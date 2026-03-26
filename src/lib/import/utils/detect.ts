import type { ImportFormatId } from './types';
import { moxfieldDescriptor } from '../formats/moxfield';
import { mtgaDescriptor } from '../formats/mtga';

const FORMAT_REGISTRY = [moxfieldDescriptor, mtgaDescriptor];

export interface DetectionResult {
	formatId: ImportFormatId;
	scores: Record<ImportFormatId, number>;
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
