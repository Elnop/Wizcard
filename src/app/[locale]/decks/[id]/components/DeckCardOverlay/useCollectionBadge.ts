import { useMemo } from 'react';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import type { DeckZone, DeckCardGroup } from '@/types/decks';
import type { CardEntry } from '@/types/cards';

export type BadgeState = 'none' | 'locked' | 'partial' | 'owned' | 'wishlist';

export type TooltipCopy = {
	key: string;
	line: string;
	count: number;
	lockedDeckName?: string;
};

export type UseCollectionBadgeResult = {
	badgeState: BadgeState;
	ownedCount: number;
	neededCount: number;
	tooltipCopies: TooltipCopy[];
	wishlistTooltipCopies: TooltipCopy[];
};

/**
 * @param oracleScryfallIds All scryfallIds for this oracle_id across all prints.
 * Must be a stable reference (e.g. from a parent useMemo) to avoid busting this memo on every render.
 */
export function useCollectionBadge(
	group: DeckCardGroup,
	currentZone: DeckZone,
	currentDeckId: string,
	oracleScryfallIds: string[],
	deckNameResolver: (deckId: string) => string | undefined,
	wishlistEntries?: Array<{ scryfallId: string; entry: CardEntry }>
): UseCollectionBadgeResult {
	const { entries: collectionEntries } = useCollectionContext();

	return useMemo(() => {
		const scryfallIdSet = new Set(oracleScryfallIds);
		const repScryfallId = group.representative.id;
		const repSet = group.representative.set?.toUpperCase() ?? '';
		const repCollectorNumber = group.representative.collector_number;

		const zoneCopies = group.byZone.get(currentZone) ?? [];
		const neededCount = zoneCopies.length;
		const ownedCount = zoneCopies.filter((c) => !!c.entry.ownerId).length;
		// owned and wishlist are mutually exclusive on a copy.
		const hasWishlistedDeckCopy = zoneCopies.some((c) => c.entry.wishlist);

		const relevantEntries = collectionEntries.filter((e) => scryfallIdSet.has(e.scryfallId));
		const availableCopies = relevantEntries.filter((e) => !e.entry.deckId);
		const lockedCopies = relevantEntries.filter(
			(e) => e.entry.deckId != null && e.entry.deckId !== currentDeckId
		);
		const ownedInCurrentDeck = relevantEntries.filter((e) => e.entry.deckId === currentDeckId);
		const relevantWishlist = (wishlistEntries ?? []).filter((e) => scryfallIdSet.has(e.scryfallId));

		// The card's own membership wins over the "x/y assignable from collection"
		// (partial) and locked states: as soon as any copy is owned the badge reads
		// owned, then wishlist, then the collection-availability hints, then nothing.
		let badgeState: BadgeState;
		if (ownedCount > 0) {
			badgeState = 'owned';
		} else if (hasWishlistedDeckCopy || relevantWishlist.length > 0) {
			badgeState = 'wishlist';
		} else if (availableCopies.length > 0) {
			badgeState = 'partial';
		} else if (lockedCopies.length > 0) {
			badgeState = 'locked';
		} else {
			badgeState = 'none';
		}

		const formatLine = (
			scryfallId: string,
			// eslint-disable-next-line sonarjs/use-type-alias -- Pick key union is not worth a standalone type alias
			entry: Pick<CardEntry, 'condition' | 'isFoil' | 'language'>,
			count: number
		): string => {
			const parts: string[] = [];
			if (scryfallId === repScryfallId) {
				parts.push(`[${repSet} #${repCollectorNumber}]`);
			}
			parts.push(entry.condition ?? 'NM');
			if (entry.isFoil) parts.push('✦');
			if (entry.language && entry.language !== 'English') parts.push(entry.language);
			const base = parts.join(' · ');
			return count > 1 ? `${base}  ×${count}` : base;
		};

		const stackMap = new Map<
			string,
			{
				scryfallId: string;
				entry: Pick<CardEntry, 'condition' | 'isFoil' | 'language'>;
				count: number;
				lockedDeckName?: string;
			}
		>();

		const stackEntry = (
			scryfallId: string,
			entry: Pick<CardEntry, 'condition' | 'isFoil' | 'language'>,
			lockedDeckName?: string
		) => {
			const key = `${scryfallId}·${entry.condition ?? 'NM'}·${entry.isFoil ? '1' : '0'}·${entry.language ?? 'en'}`;
			const existing = stackMap.get(key);
			if (existing) {
				existing.count += 1;
			} else {
				stackMap.set(key, { scryfallId, entry, count: 1, lockedDeckName });
			}
		};

		for (const e of ownedInCurrentDeck) {
			stackEntry(e.scryfallId, e.entry);
		}
		for (const e of availableCopies) {
			stackEntry(e.scryfallId, e.entry);
		}
		for (const e of lockedCopies) {
			stackEntry(
				e.scryfallId,
				e.entry,
				e.entry.deckId ? deckNameResolver(e.entry.deckId) : undefined
			);
		}

		const tooltipCopies: TooltipCopy[] = Array.from(stackMap.entries()).map(
			([key, { scryfallId, entry, count, lockedDeckName }]) => ({
				key,
				line: formatLine(scryfallId, entry, count),
				count,
				lockedDeckName,
			})
		);

		// Wishlist copies for this oracle's prints (tooltip detail)
		const wishlistStackMap = new Map<
			string,
			{
				scryfallId: string;
				entry: Pick<CardEntry, 'condition' | 'isFoil' | 'language'>;
				count: number;
			}
		>();
		for (const e of relevantWishlist) {
			const key = `${e.scryfallId}·${e.entry.condition ?? 'NM'}·${e.entry.isFoil ? '1' : '0'}·${e.entry.language ?? 'en'}`;
			const existing = wishlistStackMap.get(key);
			if (existing) {
				existing.count += 1;
			} else {
				wishlistStackMap.set(key, { scryfallId: e.scryfallId, entry: e.entry, count: 1 });
			}
		}
		const wishlistTooltipCopies: TooltipCopy[] = Array.from(wishlistStackMap.entries()).map(
			([key, { scryfallId, entry, count }]) => ({
				key,
				line: formatLine(scryfallId, entry, count),
				count,
			})
		);

		return {
			badgeState,
			ownedCount,
			neededCount,
			tooltipCopies,
			wishlistTooltipCopies,
		};
	}, [
		collectionEntries,
		group,
		currentZone,
		currentDeckId,
		oracleScryfallIds,
		deckNameResolver,
		wishlistEntries,
	]);
}
