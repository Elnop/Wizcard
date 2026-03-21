'use client';

import { createContext, useContext, useCallback } from 'react';
import { useCollectionContext } from '@/lib/supabase/contexts/CollectionContext';
import { useImport } from '@/lib/import/hooks/useImport';
import { useSyncQueueContext } from '@/lib/supabase/contexts/SyncQueueContext';

type ImportContextValue = ReturnType<typeof useImport>;

const ImportContext = createContext<ImportContextValue | null>(null);

export function ImportProvider({ children }: { children: React.ReactNode }) {
	const { triggerSync } = useSyncQueueContext();
	const { importCards } = useCollectionContext();

	const importCardsAndSync = useCallback(
		(cards: Parameters<typeof importCards>[0]) => {
			importCards(cards);
			triggerSync();
		},
		[importCards, triggerSync]
	);

	const importValue = useImport(importCardsAndSync);

	return <ImportContext value={importValue}>{children}</ImportContext>;
}

export function useImportContext(): ImportContextValue {
	const ctx = useContext(ImportContext);
	if (!ctx) throw new Error('useImportContext must be used within an ImportProvider');
	return ctx;
}
