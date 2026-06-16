'use client';

import { useEffect, useState } from 'react';
import type { DeckMeta, FolderMeta } from '@/types/decks';
import { fetchDecks } from '@/lib/deck/db/decks';
import { fetchFolders } from '@/lib/deck/db/folders';

/**
 * Read-only, context-free loader for a given owner's decks and folders. Used by
 * the public decks-list page. `fetchDecks`/`fetchFolders` are already
 * owner-parameterized and return any user's data under the public SELECT policy.
 */
export function usePublicDecks(ownerId: string): {
	decks: DeckMeta[];
	folders: FolderMeta[];
	isLoading: boolean;
} {
	const [decks, setDecks] = useState<DeckMeta[]>([]);
	const [folders, setFolders] = useState<FolderMeta[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			setIsLoading(true);
			try {
				const [d, f] = await Promise.all([fetchDecks(ownerId), fetchFolders(ownerId)]);
				if (cancelled) return;
				setDecks(d);
				setFolders(f);
			} finally {
				if (!cancelled) setIsLoading(false);
			}
		}
		void load();
		return () => {
			cancelled = true;
		};
	}, [ownerId]);

	return { decks, folders, isLoading };
}
