'use client';

import { createContext, useContext, useCallback, useMemo } from 'react';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useWishlistContext } from '@/lib/wishlist/context/WishlistContext';
import { useImport } from '@/lib/import/hooks/useImport';
import { useSyncQueueContext } from '@/lib/supabase/contexts/SyncQueueContext';

type ImportContextValue = ReturnType<typeof useImport>;

const ImportContext = createContext<ImportContextValue | null>(null);

export function ImportProvider({ children }: { children: React.ReactNode }) {
	const { triggerSync } = useSyncQueueContext();
	const { importCards: importToCollection } = useCollectionContext();
	const { importCards: importToWishlist } = useWishlistContext();

	const collectionImport = useCallback(
		(cards: Parameters<typeof importToCollection>[0]) => {
			importToCollection(cards);
			triggerSync();
		},
		[importToCollection, triggerSync]
	);

	const wishlistImport = useCallback(
		(cards: Parameters<typeof importToWishlist>[0]) => {
			importToWishlist(cards);
			triggerSync();
		},
		[importToWishlist, triggerSync]
	);

	const importers = useMemo(
		() => ({ collection: collectionImport, wishlist: wishlistImport }),
		[collectionImport, wishlistImport]
	);

	const importValue = useImport(importers);

	return <ImportContext value={importValue}>{children}</ImportContext>;
}

export function useImportContext(): ImportContextValue {
	const ctx = useContext(ImportContext);
	if (!ctx) throw new Error('useImportContext must be used within an ImportProvider');
	return ctx;
}
