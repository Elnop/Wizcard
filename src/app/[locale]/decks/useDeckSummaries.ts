'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import type { ScryfallCard, ScryfallColor } from '@/lib/scryfall/types/scryfall';
import type { DeckMeta } from '@/types/decks';
import { getDeckZone } from '@/types/decks';
import { fetchDeckCardEntries } from '@/lib/deck/db/decks';
import { resolveCardsByScryfallIds } from '@/lib/scryfall/resolveCardsByScryfallIds';
import { computeDeckStats } from '@/lib/deck/utils/deck-stats';
import { validateDeck, getFormatRules } from '@/lib/deck/utils/format-rules';
import { pickCoverArt } from '@/lib/deck/utils/pick-cover-art';

const WUBRG_ORDER: ScryfallColor[] = ['W', 'U', 'B', 'R', 'G'];

type DeckCardEntry = { scryfallId: string; tags: string[] | null };

function buildDeckSummary(
	deckId: string,
	entries: DeckCardEntry[],
	cached: Map<string, ScryfallCard>,
	format: DeckMeta['format'],
	coverArtUrl: string | null
): DeckSummary {
	const resolvedCards = entries
		.filter((e) => cached.has(e.scryfallId))
		.map((e) => ({ card: cached.get(e.scryfallId)!, zone: getDeckZone(e.tags ?? undefined) }));

	const stats = computeDeckStats(resolvedCards);
	const commanderCards = resolvedCards.filter((c) => c.zone === 'commander');
	// Match the deck-detail view (DeckDetailOwnerView/ReadOnlyView): tokens are
	// not part of the validated deck, so exclude them alongside the commander.
	// Otherwise validateDeck flags every token for legality / color-identity /
	// copy limits, so the card shows far more warnings than the deck page.
	const nonCommanderCards = resolvedCards.filter(
		(c) => c.zone !== 'commander' && c.zone !== 'tokens'
	);
	const warnings = validateDeck(format, nonCommanderCards, commanderCards);
	const rules = format ? getFormatRules(format) : null;

	return {
		artCropUrl:
			coverArtUrl ??
			pickCoverArt(
				entries
					.map((e) => ({ card: cached.get(e.scryfallId), tags: e.tags }))
					.filter((c): c is { card: ScryfallCard; tags: string[] | null } => c.card != null)
			),
		colors: computeColors(entries, cached),
		commanderName: findCommanderName(entries, cached),
		manaCurve: computeManaCurve(entries, cached),
		totalCards: stats.totalCards,
		targetCards: rules ? rules.minMainboard + rules.commanderCount : null,
		landCount: stats.landCount,
		averageCmc: stats.averageCmc,
		warningCount: warnings.length,
		warnings: warnings.map((w) => w.message),
	};
}

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

function isLand(card: ScryfallCard): boolean {
	return (card.type_line ?? '').toLowerCase().includes('land');
}

function hasCommanderTag(tags: string[] | null): boolean {
	return tags?.some((t) => t === 'deck:commander') ?? false;
}

function sortWubrg(colors: Set<ScryfallColor>): ScryfallColor[] {
	return WUBRG_ORDER.filter((c) => colors.has(c));
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
	const names: string[] = [];
	for (const e of entries) {
		if (hasCommanderTag(e.tags)) {
			const card = cardMap.get(e.scryfallId);
			if (card) {
				const name = card.name;
				const slashIdx = name.indexOf(' // ');
				names.push(slashIdx !== -1 ? name.slice(0, slashIdx) : name);
			}
		}
	}
	return names.length > 0 ? names.join(' & ') : undefined;
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

			const cached = await resolveCardsByScryfallIds([...allIds], {
				isCancelled: () => runIdRef.current !== currentRunId,
			});

			if (runIdRef.current !== currentRunId) return;

			const deckFormatMap = new Map(decks.map((d) => [d.id, d.format]));
			const deckCoverMap = new Map(decks.map((d) => [d.id, d.coverArtUrl]));
			const result: Record<string, DeckSummary> = {};
			for (const [deckId, entries] of Object.entries(deckEntries)) {
				result[deckId] = buildDeckSummary(
					deckId,
					entries,
					cached,
					deckFormatMap.get(deckId) ?? null,
					deckCoverMap.get(deckId) ?? null
				);
			}

			// Merge, never replace. Infinite scroll re-runs this for the whole
			// grown list, so replacing wholesale made every already-resolved cover
			// blink out and re-resolve on each page. Merging keeps visible covers
			// stable and only fills in the newly-loaded decks.
			setSummaries((prev) => ({ ...prev, ...result }));
		}

		void resolve();

		return () => {
			runIdRef.current++; // eslint-disable-line react-hooks/exhaustive-deps
		};
	}, [deckIds, decks]);

	return summaries;
}
