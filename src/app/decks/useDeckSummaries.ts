'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import type { ScryfallCard, ScryfallColor } from '@/lib/scryfall/types/scryfall';
import type { DeckMeta, DeckZone } from '@/types/decks';
import { getDeckZone } from '@/types/decks';
import { fetchDeckCardEntries } from '@/lib/deck/db/decks';
import { getCardsFromCache, putCardsInCache } from '@/lib/scryfall/utils/card-cache';
import { getCardCollection } from '@/lib/scryfall/endpoints/cards';
import { computeDeckStats } from '@/lib/deck/utils/deck-stats';
import { validateDeck, getFormatRules } from '@/lib/deck/utils/format-rules';

const WUBRG_ORDER: ScryfallColor[] = ['W', 'U', 'B', 'R', 'G'];

export type DeckSummary = {
	artCropUrl: string | undefined;
	colors: ScryfallColor[];
	commanderName: string | undefined;
	manaCurve: Record<number, number>;
	totalCards: number;
	targetCards: number | null;
	landCount: number;
	averageCmc: number;
	warningCount: number;
	warnings: string[];
};

const EMPTY: Record<string, DeckSummary> = {};

function getArtCropUrl(card: ScryfallCard): string | null {
	return card.image_uris?.art_crop ?? card.card_faces?.[0]?.image_uris?.art_crop ?? null;
}

function isLand(card: ScryfallCard): boolean {
	return (card.type_line ?? '').toLowerCase().includes('land');
}

function hasCommanderTag(tags: string[] | null): boolean {
	return tags?.some((t) => t === 'deck:commander') ?? false;
}

function sortWubrg(colors: Set<ScryfallColor>): ScryfallColor[] {
	return WUBRG_ORDER.filter((c) => colors.has(c));
}

function pickArtCrop(
	entries: Array<{ scryfallId: string; tags: string[] | null }>,
	cardMap: Map<string, ScryfallCard>
): string | undefined {
	// 1. Commander
	for (const e of entries) {
		if (hasCommanderTag(e.tags)) {
			const card = cardMap.get(e.scryfallId);
			if (card) {
				const url = getArtCropUrl(card);
				if (url) return url;
			}
		}
	}
	// 2. First non-land
	for (const e of entries) {
		const card = cardMap.get(e.scryfallId);
		if (card && !isLand(card)) {
			const url = getArtCropUrl(card);
			if (url) return url;
		}
	}
	// 3. Any card
	for (const e of entries) {
		const card = cardMap.get(e.scryfallId);
		if (card) {
			const url = getArtCropUrl(card);
			if (url) return url;
		}
	}
	return undefined;
}

function computeColors(
	entries: Array<{ scryfallId: string; tags: string[] | null }>,
	cardMap: Map<string, ScryfallCard>
): ScryfallColor[] {
	const colors = new Set<ScryfallColor>();
	for (const e of entries) {
		const card = cardMap.get(e.scryfallId);
		if (card?.color_identity) {
			for (const c of card.color_identity) {
				colors.add(c);
			}
		}
	}
	return sortWubrg(colors);
}

function findCommanderName(
	entries: Array<{ scryfallId: string; tags: string[] | null }>,
	cardMap: Map<string, ScryfallCard>
): string | undefined {
	for (const e of entries) {
		if (hasCommanderTag(e.tags)) {
			const card = cardMap.get(e.scryfallId);
			if (card) {
				const name = card.name;
				const slashIdx = name.indexOf(' // ');
				return slashIdx !== -1 ? name.slice(0, slashIdx) : name;
			}
		}
	}
	return undefined;
}

function computeManaCurve(
	entries: Array<{ scryfallId: string; tags: string[] | null }>,
	cardMap: Map<string, ScryfallCard>
): Record<number, number> {
	const curve: Record<number, number> = {};
	for (const e of entries) {
		const card = cardMap.get(e.scryfallId);
		if (!card || isLand(card)) continue;
		const bucket = Math.min(Math.floor(card.cmc), 7);
		curve[bucket] = (curve[bucket] ?? 0) + 1;
	}
	return curve;
}

export function useDeckSummaries(decks: DeckMeta[]): Record<string, DeckSummary> {
	const [summaries, setSummaries] = useState<Record<string, DeckSummary>>(EMPTY);
	const runIdRef = useRef(0);

	const deckIds = useMemo(() => decks.map((d) => d.id), [decks]);

	useEffect(() => {
		if (deckIds.length === 0) return;

		const currentRunId = ++runIdRef.current;

		async function resolve() {
			const deckEntries = await fetchDeckCardEntries(deckIds);

			const allIds = new Set<string>();
			for (const entries of Object.values(deckEntries)) {
				for (const e of entries) allIds.add(e.scryfallId);
			}
			if (allIds.size === 0 || runIdRef.current !== currentRunId) return;

			const allIdsArr = [...allIds];
			const cached = await getCardsFromCache(allIdsArr);
			const missingIds = allIdsArr.filter((id) => !cached.has(id));

			if (missingIds.length > 0) {
				for (let i = 0; i < missingIds.length; i += 75) {
					if (runIdRef.current !== currentRunId) return;
					const batch = missingIds.slice(i, i + 75);
					try {
						const result = await getCardCollection(batch.map((id) => ({ id })));
						await putCardsInCache(result.data);
						for (const card of result.data) {
							cached.set(card.id, card);
						}
					} catch (err) {
						console.error('[useDeckSummaries] Failed to resolve cards:', err);
					}
				}
			}

			if (runIdRef.current !== currentRunId) return;

			const deckFormatMap = new Map(decks.map((d) => [d.id, d.format]));

			const result: Record<string, DeckSummary> = {};
			for (const [deckId, entries] of Object.entries(deckEntries)) {
				// Build resolved cards with zones for stats/validation
				const resolvedCards: Array<{ card: ScryfallCard; zone: DeckZone }> = [];
				for (const e of entries) {
					const card = cached.get(e.scryfallId);
					if (card) {
						resolvedCards.push({ card, zone: getDeckZone(e.tags ?? undefined) });
					}
				}

				const stats = computeDeckStats(resolvedCards);
				const format = deckFormatMap.get(deckId) ?? null;
				const commanderCards = resolvedCards.filter((c) => c.zone === 'commander');
				const nonCommanderCards = resolvedCards.filter((c) => c.zone !== 'commander');
				const warnings = validateDeck(format, nonCommanderCards, commanderCards);

				const rules = format ? getFormatRules(format) : null;
				const targetCards = rules ? rules.minMainboard + rules.commanderCount : null;

				result[deckId] = {
					artCropUrl: pickArtCrop(entries, cached),
					colors: computeColors(entries, cached),
					commanderName: findCommanderName(entries, cached),
					manaCurve: computeManaCurve(entries, cached),
					totalCards: stats.totalCards,
					targetCards,
					landCount: stats.landCount,
					averageCmc: stats.averageCmc,
					warningCount: warnings.length,
					warnings: warnings.map((w) => w.message),
				};
			}

			setSummaries(result);
		}

		void resolve();

		return () => {
			runIdRef.current++; // eslint-disable-line react-hooks/exhaustive-deps
		};
	}, [deckIds, decks]);

	return summaries;
}
