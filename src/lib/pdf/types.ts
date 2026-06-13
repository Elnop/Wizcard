import type { DeckZone } from '@/types/decks';

export type DeckPdfExportOptions = {
	zones: DeckZone[];
	ignoreOwned: boolean;
	ignoreBasicLands: boolean;
};
