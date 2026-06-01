export interface MpcSource {
	id: string;
	name: string;
	description?: string;
	isBuiltIn: boolean;
	tags: string[];
}

export interface MpcCard {
	id: string;
	name: string;
	sourceId: string;
	imageUrl: string;
	isCustom: true;
}

export interface MpcIndexEntry {
	identifier: string; // Google Drive file ID
	name: string; // Normalized card name (for matching)
	rawName: string; // Original name from mpcfill
	sourceName: string; // e.g. "TwoSheds"
	sourceKey: string; // e.g. "TwoSheds"
	smallThumbnailUrl: string;
	mediumThumbnailUrl: string;
	tags: string[];
	dpi: number;
}
