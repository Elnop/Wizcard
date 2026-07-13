'use client';

import { useEffect, useState } from 'react';
import type { CardEntry } from '@/types/cards';
import { fetchPublicWishlistPage } from '@/lib/wishlist/db/wishlist';

type WishlistEntry = { scryfallId: string; entry: CardEntry };

const DB_PAGE = 1000;

/**
 * Read-only, context-free loader for a given owner's public wishlist. Paginates
 * `fetchPublicWishlistPage` into local state, mirroring `usePublicCollection`.
 */
export function usePublicWishlist(ownerId: string): {
	entries: WishlistEntry[];
	isLoaded: boolean;
	isFullyLoaded: boolean;
} {
	const [entries, setEntries] = useState<WishlistEntry[]>([]);
	const [isLoaded, setIsLoaded] = useState(false);
	const [isFullyLoaded, setIsFullyLoaded] = useState(false);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			setIsLoaded(false);
			setIsFullyLoaded(false);
			setEntries([]);
			const acc: WishlistEntry[] = [];
			let from = 0;
			while (true) {
				const { rows, hasMore } = await fetchPublicWishlistPage(ownerId, from);
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
