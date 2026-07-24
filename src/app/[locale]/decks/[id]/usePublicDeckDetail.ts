'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import type { Card, CardEntry } from '@/types/cards';
import type { CustomCard } from '@/lib/mpc/types';
import type { DeckMeta, DeckZone } from '@/types/decks';
import { getDeckZone } from '@/types/decks';
import { fetchDeckMetaById, fetchDeckCards } from '@/lib/deck/db/decks';
import { fetchProfile } from '@/lib/profile/db/profiles';
import { resolveCardsByScryfallIds } from '@/lib/scryfall/resolveCardsByScryfallIds';
import { computeDeckStats, type DeckStats } from '@/lib/deck/utils/deck-stats';
import { pickCoverArt } from '@/lib/deck/utils/pick-cover-art';
import type { ResolvedDeckCard } from './useDeckDetail';

type DeckCard = { scryfallId: string; entry: CardEntry };

export interface InitialPublicDeckData {
	deck: DeckMeta;
	ownerNickname: string | null;
	deckCards: DeckCard[];
	cards: Card[];
}

/**
 * Read-only, context-free counterpart of {@link useDeckDetail}. Loads a deck and
 * its cards directly from the DB by id (no owner filter, relies on the public
 * SELECT policy) so a non-owner / anonymous visitor can view any deck. Produces
 * the same shape as useDeckDetail for reuse by the read-only deck view.
 *
 * When `initial` is provided (server-rendered data from Task 2), state is
 * seeded from it and the fetch effects below skip their network calls.
 */
export function usePublicDeckDetail(deckId: string, initial?: InitialPublicDeckData) {
	const [deck, setDeck] = useState<DeckMeta | null>(initial?.deck ?? null);
	const [ownerNickname, setOwnerNickname] = useState<string | null>(initial?.ownerNickname ?? null);
	const [deckCards, setDeckCards] = useState<DeckCard[]>(initial?.deckCards ?? []);
	const [scryfallCards, setScryfallCards] = useState<Record<string, Card | CustomCard>>(() =>
		Object.fromEntries((initial?.cards ?? []).map((c) => [c.id, c]))
	);
	// Pre-seed with the ids the server already resolved so the resolution effect
	// below computes an empty `toResolve` — no network call at all when the
	// catalog covered the whole deck, and exactly the misses when it didn't.
	const resolvedIdsRef = useRef<Set<string>>(new Set((initial?.cards ?? []).map((c) => c.id)));
	const [resolveGeneration, setResolveGeneration] = useState(0);
	const [isLoading, setIsLoading] = useState(!initial);
	const activeResolveRef = useRef(0);

	// Load deck meta + cards from DB
	useEffect(() => {
		// Server already provided deck + cards; nothing to fetch.
		if (initial) return;
		let cancelled = false;
		async function load() {
			setIsLoading(true);
			try {
				const [meta, cards] = await Promise.all([
					fetchDeckMetaById(deckId),
					fetchDeckCards(deckId),
				]);
				if (cancelled) return;
				setDeck(meta);
				// Le flag `proxy` est une info privée de l'owner (statut physique de
				// SA collection). Un visiteur non-owner ne doit pas le voir → on le
				// neutralise à la source, ce qui couvre d'un coup le badge grille, le
				// badge modal et l'image du modal, tous en aval de `entry.proxy`.
				setDeckCards(cards.map((c) => ({ ...c, entry: { ...c.entry, proxy: false } })));
			} finally {
				if (!cancelled) setIsLoading(false);
			}
		}
		void load();
		return () => {
			cancelled = true;
		};
	}, [deckId, initial]);

	// Resolve the owner's public nickname for the "by <author>" byline / profile
	// link. Precons (source 'mtgjson') have no owner → ownerId is null → no byline.
	// The deck is only visible to a non-owner when the owner's profile is public,
	// so linking to /users/<nickname> here is always safe.
	useEffect(() => {
		if (initial) return;
		const ownerId = deck?.ownerId;
		let cancelled = false;
		// No owner (precon) resolves to a null nickname via the same async path, so
		// the reset never runs synchronously in the effect body.
		const resolve = ownerId
			? fetchProfile(ownerId).then((profile) => profile?.nickname ?? null)
			: Promise.resolve<string | null>(null);
		void resolve
			.then((nickname) => {
				if (!cancelled) setOwnerNickname(nickname);
			})
			.catch(() => {
				if (!cancelled) setOwnerNickname(null);
			});
		return () => {
			cancelled = true;
		};
	}, [deck?.ownerId, initial]);

	// Resolve Scryfall data for all unique scryfall IDs
	useEffect(() => {
		const uniqueIds = [...new Set(deckCards.map((e) => e.scryfallId))];
		const toResolve = uniqueIds.filter((id) => !resolvedIdsRef.current.has(id));
		if (toResolve.length === 0) return;

		const generation = ++activeResolveRef.current;
		const capturedGeneration = generation;
		setResolveGeneration(generation);

		async function resolve() {
			const resolvedMap = await resolveCardsByScryfallIds(toResolve, {
				isCancelled: () => activeResolveRef.current !== capturedGeneration,
			});
			if (activeResolveRef.current === capturedGeneration) {
				const resolved = Object.fromEntries(resolvedMap);
				for (const id of resolvedMap.keys()) {
					resolvedIdsRef.current.add(id);
				}
				setScryfallCards((prev) => ({ ...prev, ...resolved }));
				setResolveGeneration(0);
			}
		}

		void resolve();
		return () => {
			if (activeResolveRef.current === capturedGeneration) {
				// eslint-disable-next-line react-hooks/exhaustive-deps -- activeResolveRef is a generation counter, not a DOM ref
				activeResolveRef.current++;
			}
		};
	}, [deckCards]);

	// Build resolved cards list
	const resolvedCards: ResolvedDeckCard[] = useMemo(() => {
		return deckCards
			.slice()
			.sort((a, b) => {
				const da = a.entry.dateAdded ?? '';
				const db = b.entry.dateAdded ?? '';
				if (da < db) return -1;
				if (da > db) return 1;
				return 0;
			})
			.map((copy): ResolvedDeckCard | null => {
				const card = scryfallCards[copy.scryfallId];
				if (!card) return null;
				return { ...card, entry: copy.entry };
			})
			.filter((c): c is ResolvedDeckCard => c !== null);
	}, [deckCards, scryfallCards]);

	// Group by zone
	const cardsByZone = useMemo(() => {
		const grouped: Record<DeckZone, ResolvedDeckCard[]> = {
			mainboard: [],
			sideboard: [],
			maybeboard: [],
			commander: [],
			tokens: [],
		};
		for (const rc of resolvedCards) {
			grouped[getDeckZone(rc.entry.tags)].push(rc);
		}
		return grouped;
	}, [resolvedCards]);

	// Compute stats
	const stats: DeckStats = useMemo(() => {
		return computeDeckStats(
			resolvedCards
				.filter((rc) => getDeckZone(rc.entry.tags) !== 'tokens')
				.map((rc) => ({ card: rc, zone: getDeckZone(rc.entry.tags) }))
		);
	}, [resolvedCards]);

	const coverArtUrl = useMemo(
		() =>
			deck?.coverArtUrl ??
			pickCoverArt(resolvedCards.map((rc) => ({ card: rc, tags: rc.entry.tags }))),
		[deck?.coverArtUrl, resolvedCards]
	);

	const isResolving = resolveGeneration > 0;

	return {
		deck,
		ownerNickname,
		cardsByZone,
		resolvedCards,
		stats,
		coverArtUrl,
		isLoading,
		isResolving,
		// Known before Scryfall resolution completes — lets the UI reserve a
		// skeleton grid sized to the real deck instead of a fixed placeholder
		// count, avoiding a layout shift when resolvedCards pops in.
		deckCardCount: deckCards.length,
	};
}
