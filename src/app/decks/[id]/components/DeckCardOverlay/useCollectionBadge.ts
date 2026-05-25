import { useMemo } from 'react';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import type { DeckCardGroup } from '../../useDeckCardSections';
import type { DeckZone } from '@/types/decks';
import type { CardEntry } from '@/types/cards';

export type BadgeState = 'none' | 'locked' | 'partial' | 'owned';

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
	deckNameResolver: (deckId: string) => string | undefined
): UseCollectionBadgeResult {
	const { entries: collectionEntries } = useCollectionContext();

	return useMemo(() => {
		const scryfallIdSet = new Set(oracleScryfallIds);
		const repScryfallId = group.representative.id;
		const repSet = group.representative.set.toUpperCase();
		const repCollectorNumber = group.representative.collector_number;

		const zoneCopies = group.byZone.get(currentZone) ?? [];
		const neededCount = zoneCopies.length;
		const ownedCount = zoneCopies.filter((c) => c.entry.deckId === currentDeckId).length;

		const relevantEntries = collectionEntries.filter((e) => scryfallIdSet.has(e.scryfallId));
		const availableCopies = relevantEntries.filter((e) => !e.entry.deckId);
		const lockedCopies = relevantEntries.filter(
			(e) => e.entry.deckId != null && e.entry.deckId !== currentDeckId
		);

		let badgeState: BadgeState;
		if (ownedCount === neededCount && neededCount > 0) {
			badgeState = 'owned';
		} else if (availableCopies.length > 0 || ownedCount > 0) {
			badgeState = 'partial';
		} else if (lockedCopies.length > 0) {
			badgeState = 'locked';
		} else {
			badgeState = 'none';
		}

		const formatLine = (
			scryfallId: string,
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

		return { badgeState, ownedCount, neededCount, tooltipCopies };
	}, [collectionEntries, group, currentZone, currentDeckId, oracleScryfallIds, deckNameResolver]);
}
