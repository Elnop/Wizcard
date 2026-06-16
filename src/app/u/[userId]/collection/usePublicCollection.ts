'use client';

import { useEffect, useState } from 'react';
import type { CardEntry } from '@/types/cards';
import { fetchPublicCollectionPage } from '@/lib/collection/db/collection';

type CollectionEntry = { scryfallId: string; entry: CardEntry };

const DB_PAGE = 1000;

/**
 * Read-only, context-free loader for a given owner's collection. Paginates
 * `fetchPublicCollectionPage` (which reads the purchase_price-free public view)
 * into local state, mirroring the store's hydration loop. `isFullyLoaded`
 * stays false until every page has arrived so the grid can freeze on skeletons.
 */
export function usePublicCollection(ownerId: string): {
	entries: CollectionEntry[];
	isLoaded: boolean;
	isFullyLoaded: boolean;
} {
	const [entries, setEntries] = useState<CollectionEntry[]>([]);
	const [isLoaded, setIsLoaded] = useState(false);
	const [isFullyLoaded, setIsFullyLoaded] = useState(false);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			setIsLoaded(false);
			setIsFullyLoaded(false);
			setEntries([]);
			const acc: CollectionEntry[] = [];
			let from = 0;
			while (true) {
				const { rows, hasMore } = await fetchPublicCollectionPage(ownerId, from);
				if (cancelled) return;
				acc.push(...rows);
				setEntries([...acc]);
				setIsLoaded(true);
				setIsFullyLoaded(!hasMore);
				if (!hasMore) break;
				from += DB_PAGE;
			}
		}
		void load();
		return () => {
			cancelled = true;
		};
	}, [ownerId]);

	return { entries, isLoaded, isFullyLoaded };
}
