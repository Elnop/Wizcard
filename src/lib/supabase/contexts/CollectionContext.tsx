'use client';

import { createContext, useContext } from 'react';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { useCollection } from '@/lib/supabase/hooks/useCollection';
import { useSyncQueueContext } from '@/lib/supabase/contexts/SyncQueueContext';

type CollectionContextValue = ReturnType<typeof useCollection>;

const CollectionContext = createContext<CollectionContextValue | null>(null);

export function CollectionProvider({ children }: { children: React.ReactNode }) {
	const { user, isLoading: authLoading } = useAuth();
	const { triggerSync } = useSyncQueueContext();
	const value = useCollection(user?.id ?? null, authLoading, triggerSync);
	return <CollectionContext value={value}>{children}</CollectionContext>;
}

export function useCollectionContext(): CollectionContextValue {
	const ctx = useContext(CollectionContext);
	if (!ctx) throw new Error('useCollectionContext must be used within a CollectionProvider');
	return ctx;
}
