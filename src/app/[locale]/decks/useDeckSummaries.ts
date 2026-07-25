'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import type { Card, MtgColor } from '@/types/cards';
import type { CustomCard } from '@/lib/mpc/types';
import type { DeckMeta } from '@/types/decks';
import { getDeckZone } from '@/types/decks';
import { fetchDeckCardEntries } from '@/lib/deck/db/decks';
import { resolveCardsByScryfallIds } from '@/lib/scryfall/resolveCardsByScryfallIds';
import { computeDeckStats } from '@/lib/deck/utils/deck-stats';
import { validateDeck, getFormatRules } from '@/lib/deck/utils/format-rules';
import { pickCoverArt } from '@/lib/deck/utils/pick-cover-art';
import { fetchCoverInfoByPrintIds } from '@/lib/deck/db/cover-art-catalog';
import { coverCandidateIds, pickCoverFromCatalog } from '@/lib/deck/utils/pick-cover-from-catalog';

const WUBRG_ORDER: MtgColor[] = ['W', 'U', 'B', 'R', 'G'];

type DeckCardEntry = { scryfallId: string; tags: string[] | null };

function buildDeckSummary(
	deckId: string,
	entries: DeckCardEntry[],
	cached: Map<string, Card | CustomCard>,
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
					.filter((c): c is { card: Card | CustomCard; tags: string[] | null } => c.card != null)
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
	colors: MtgColor[];
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

/**
 * Placeholder a deck holds between pass 1 (cover painted) and pass 2 (stats in).
 * Every stat reads as "nothing yet" so DeckCard renders the cover alone: no
 * colors, no mana curve, no warning badge — each of those is guarded on a
 * non-empty value at the render site, so none of them flash in early.
 */
const PENDING_SUMMARY: DeckSummary = {
	artCropUrl: undefined,
	colors: [],
	commanderName: undefined,
	manaCurve: {},
	totalCards: 0,
	targetCards: null,
	landCount: 0,
	averageCmc: 0,
	warningCount: 0,
	warnings: [],
};

function isLand(card: Card | CustomCard): boolean {
	return (card.type_line ?? '').toLowerCase().includes('land');
}

function hasCommanderTag(tags: string[] | null): boolean {
	return tags?.some((t) => t === 'deck:commander') ?? false;
}

function sortWubrg(colors: Set<MtgColor>): MtgColor[] {
	return WUBRG_ORDER.filter((c) => colors.has(c));
}

function computeColors(
	entries: Array<{ scryfallId: string; tags: string[] | null }>,
	cardMap: Map<string, Card | CustomCard>
): MtgColor[] {
	const colors = new Set<MtgColor>();
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
	cardMap: Map<string, Card | CustomCard>
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
	cardMap: Map<string, Card | CustomCard>
): Record<number, number> {
	const curve: Record<number, number> = {};
	for (const e of entries) {
		const card = cardMap.get(e.scryfallId);
		if (!card || isLand(card)) continue;
		const bucket = Math.min(Math.floor(card.cmc ?? 0), 7);
		curve[bucket] = (curve[bucket] ?? 0) + 1;
	}
	return curve;
}

/**
 * Pass 1 of the summary build: derive a cover for every deck that lacks an
 * explicit one, using only the DB catalog.
 *
 * Split out from the effect both to keep it readable and because it is the whole
 * fast path: it returns as soon as the catalog answers, long before any card is
 * resolved through Scryfall. Decks whose cover the catalog can't derive are
 * absent from the result and get theirs from pass 2 instead.
 */
async function resolveCoversFromCatalog(
	deckEntries: Record<string, DeckCardEntry[]>,
	deckCoverMap: Map<string, string | null>
): Promise<Record<string, string>> {
	const deckIdsNeedingCover = Object.keys(deckEntries).filter((id) => !deckCoverMap.get(id));
	if (deckIdsNeedingCover.length === 0) return {};

	const lookupIds = new Set<string>();
	for (const deckId of deckIdsNeedingCover) {
		for (const id of coverCandidateIds(deckEntries[deckId])) lookupIds.add(id);
	}
	if (lookupIds.size === 0) return {};

	const coverInfo = await fetchCoverInfoByPrintIds([...lookupIds]);

	const covers: Record<string, string> = {};
	for (const deckId of deckIdsNeedingCover) {
		const url = pickCoverFromCatalog(deckEntries[deckId], coverInfo);
		if (url) covers[deckId] = url;
	}
	return covers;
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

			const deckFormatMap = new Map(decks.map((d) => [d.id, d.format]));
			const deckCoverMap = new Map(decks.map((d) => [d.id, d.coverArtUrl]));

			// ── Pass 1: covers only ──────────────────────────────────────────────
			// The cover needs ONE card per deck, but deck stats need every card.
			// Resolving them together meant a thumbnail waited on the full
			// resolution of every card of every listed deck (dozens of sequential
			// Scryfall batches on a cold cache) — the reason covers took so long or
			// never showed. So covers are resolved first, from the DB catalog, and
			// painted before any stats work begins.
			const covers = await resolveCoversFromCatalog(deckEntries, deckCoverMap);
			if (runIdRef.current !== currentRunId) return;

			if (Object.keys(covers).length > 0) {
				setSummaries((prev) => {
					const next = { ...prev };
					for (const [deckId, url] of Object.entries(covers)) {
						next[deckId] = { ...(next[deckId] ?? PENDING_SUMMARY), artCropUrl: url };
					}
					return next;
				});
			}

			// ── Pass 2: full stats ───────────────────────────────────────────────
			// Everything else on the card (mana curve, counts, warnings) genuinely
			// needs every card resolved. It runs after the covers are on screen, so
			// this cost is no longer in front of the first paint.
			const cached = await resolveCardsByScryfallIds([...allIds], {
				isCancelled: () => runIdRef.current !== currentRunId,
			});

			if (runIdRef.current !== currentRunId) return;

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
			//
			// Keep the pass-1 cover when pass 2 couldn't derive one: an unresolved
			// card (network failure, id absent from Scryfall) would otherwise blank
			// a cover the catalog had already produced.
			setSummaries((prev) => {
				const next = { ...prev };
				for (const [deckId, summary] of Object.entries(result)) {
					next[deckId] = {
						...summary,
						artCropUrl: summary.artCropUrl ?? prev[deckId]?.artCropUrl,
					};
				}
				return next;
			});
		}

		void resolve();

		return () => {
			runIdRef.current++; // eslint-disable-line react-hooks/exhaustive-deps
		};
	}, [deckIds, decks]);

	return summaries;
}
