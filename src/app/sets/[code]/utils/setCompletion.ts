import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { CardOwnership } from '@/lib/collection/context/CollectionContext';

/** Per-print ownership flags used to drive the collection grid rendering. */
export interface PrintStatus {
	owned: boolean;
	foil: boolean;
	nonFoil: boolean;
}

export interface SetCompletion {
	/** Number of cards (prints) in the set. */
	totalPrints: number;
	/** Prints of which the user owns at least one copy. */
	ownedPrints: number;
	/** Prints of which the user owns at least one foil copy. */
	ownedFoilPrints: number;
	/** Prints of which the user owns at least one non-foil copy. */
	ownedNonFoilPrints: number;
	/** Per-print status keyed by scryfall_id, for grid rendering. */
	status: Map<string, PrintStatus>;
}

/**
 * Computes set-completion stats by exact print (scryfall_id): a set card counts
 * as owned only when the user owns that specific printing.
 */
export function computeSetCompletion(
	cards: ScryfallCard[],
	getOwnership: (scryfallId: string) => CardOwnership
): SetCompletion {
	const status = new Map<string, PrintStatus>();
	let ownedPrints = 0;
	let ownedFoilPrints = 0;
	let ownedNonFoilPrints = 0;

	for (const card of cards) {
		const o = getOwnership(card.id);
		const owned = o.total > 0;
		const foil = o.foil > 0;
		const nonFoil = o.nonFoil > 0;
		status.set(card.id, { owned, foil, nonFoil });
		if (owned) ownedPrints += 1;
		if (foil) ownedFoilPrints += 1;
		if (nonFoil) ownedNonFoilPrints += 1;
	}

	return {
		totalPrints: cards.length,
		ownedPrints,
		ownedFoilPrints,
		ownedNonFoilPrints,
		status,
	};
}
