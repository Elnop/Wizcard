'use client';

import { useState, useEffect } from 'react';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { getCardCollection } from '@/lib/scryfall/endpoints/cards';
import { BATCH_SIZE } from '@/lib/scryfall/constants';
import { fetchEdhrecRecommendations } from '../fetch-recommendations';
import { toEdhrecSlug } from '../slug';
import type { EdhrecSection } from '../types';

export interface EdhrecResolvedSection {
	header: string;
	/** Resolved cards; empty while `status === 'pending'`. */
	cards: ScryfallCard[];
	status: 'pending' | 'ready';
}

interface UseEdhrecRecommendationsResult {
	sections: EdhrecResolvedSection[];
	/** True until the EDHREC section structure has been fetched. */
	isLoading: boolean;
	error: Error | null;
}

/** Resolve a list of card names to ScryfallCards, keyed by lowercased name. */
async function resolveNames(names: string[]): Promise<Map<string, ScryfallCard>> {
	const byName = new Map<string, ScryfallCard>();
	for (let i = 0; i < names.length; i += BATCH_SIZE) {
		const chunk = names.slice(i, i + BATCH_SIZE);
		const result = await getCardCollection(chunk.map((name) => ({ name })));
		for (const card of result.data) {
			byName.set(card.name.toLowerCase(), card);
		}
	}
	return byName;
}

/** Map one EDHREC section's card names onto resolved Scryfall cards, preserving order. */
function mapSectionCards(
	section: EdhrecSection,
	byName: Map<string, ScryfallCard>
): ScryfallCard[] {
	const cards: ScryfallCard[] = [];
	for (const cv of section.cards) {
		const card = byName.get(cv.name.toLowerCase());
		if (card) cards.push(card);
	}
	return cards;
}

/** Immutably flip the section at `index` to ready with its resolved cards. */
function withSectionReady(
	prev: EdhrecResolvedSection[],
	index: number,
	cards: ScryfallCard[]
): EdhrecResolvedSection[] {
	const next = prev.slice();
	if (next[index]) next[index] = { ...next[index], cards, status: 'ready' };
	return next;
}

/**
 * Fetch EDHREC recommendations for a commander and resolve each recommended
 * card name to full Scryfall data so it can render in the shared CardList.
 *
 * Sections appear progressively: their headers show up as soon as EDHREC
 * responds (each marked `pending`), then each section flips to `ready` as its
 * cards finish resolving against Scryfall.
 *
 * No request fires while `commanderName` is null.
 */
export function useEdhrecRecommendations(
	commanderName: string | null
): UseEdhrecRecommendationsResult {
	const [sections, setSections] = useState<EdhrecResolvedSection[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	useEffect(() => {
		if (!commanderName) return;

		let cancelled = false;

		// Defer the loading flag out of the synchronous effect body so React
		// doesn't see a synchronous setState (avoids cascading renders).
		void Promise.resolve().then(() => {
			if (!cancelled) {
				setIsLoading(true);
				setError(null);
				setSections([]);
			}
		});

		const run = async () => {
			const rawSections = await fetchEdhrecRecommendations(toEdhrecSlug(commanderName));
			if (cancelled) return;

			// Show all section headers immediately as pending shells.
			setSections(rawSections.map((s) => ({ header: s.header, cards: [], status: 'pending' })));
			setIsLoading(false);

			// Resolve each section's cards in order; flip it to ready when done.
			for (let i = 0; i < rawSections.length; i++) {
				if (cancelled) return;
				const names = [...new Set(rawSections[i].cards.map((c) => c.name))];
				const byName = await resolveNames(names);
				if (cancelled) return;
				const cards = mapSectionCards(rawSections[i], byName);
				setSections((prev) => withSectionReady(prev, i, cards));
			}
		};

		run().catch((err: unknown) => {
			if (cancelled) return;
			setSections([]);
			setIsLoading(false);
			setError(err instanceof Error ? err : new Error('Failed to load EDHREC data'));
		});

		return () => {
			cancelled = true;
		};
	}, [commanderName]);

	return { sections, isLoading, error };
}
