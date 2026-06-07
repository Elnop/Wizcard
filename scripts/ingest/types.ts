// Shared types for the MPC ingest pipeline modules.

import type { parseCardFilename } from '../../src/lib/mpc/parse-filename';
import type { CardType } from '../../src/lib/mpc/types';

export interface MpcfillSourceRaw {
	pk: number;
	key: string;
	name: string;
	description: string;
	sourceType: string;
	externalLink: string;
}

export interface MpcfillSourcesResponse {
	results: Record<string, MpcfillSourceRaw>;
}

export interface DriveImageEntry {
	id: string;
	name: string;
	folderPath: string[]; // Folder names from root to immediate parent
}

export interface PendingCard {
	cardId: string;
	file: DriveImageEntry;
	parsed: ReturnType<typeof parseCardFilename>;
	setCode: string | null;
	cardType: CardType;
	allTags: string[];
	isReEnrich: boolean;
	alreadyMirrored: boolean;
}

export interface ImageResult {
	imageHash: string | null;
	storagePath: string | null;
	isDuplicate: boolean;
	imagesMirrored: number;
	warnings: string[];
}

export interface IngestResult {
	newCount: number;
	skippedCount: number;
	failedCount: number;
	reEnrichedCount: number;
	imagesMirrored: number;
	duplicateImages: number;
	resolvedBySetNum: number;
	resolvedByName: number;
	resolvedByFuzzy: number;
	unresolvedFiles: string[];
	warnings: string[];
	backfilledCount?: number;
}

export interface SourceReport {
	sourceId: string;
	resolved: number;
	skipped: number;
	failed: number;
	upserted: number;
	reEnriched: number;
	imagesMirrored: number;
	duplicateImages: number;
	backfilled: number;
	unresolvedFiles: string[];
	warnings: string[];
}

export interface RunReport {
	startedAt: string;
	finishedAt: string;
	flags: {
		source?: string;
		limit?: number;
		skipScryfall: boolean;
		fuzzy: boolean;
		reEnrich: boolean;
		reEnrichDays: number;
		checkImageHash: boolean;
		mirrorImages: boolean;
		reportPath?: string;
	};
	sources: SourceReport[];
	totals: Omit<SourceReport, 'sourceId'>;
	warnings: string[];
}
