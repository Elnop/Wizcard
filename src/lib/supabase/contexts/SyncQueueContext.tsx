'use client';

import { createContext, useContext } from 'react';
import type { SyncStatus } from '@/lib/supabase/hooks/useSyncQueue';

type SyncQueueContextValue = {
	syncStatus: SyncStatus;
	failedCount: number;
	retry: () => void;
	triggerSync: () => void;
};

export const SyncQueueContext = createContext<SyncQueueContextValue>({
	syncStatus: 'idle',
	failedCount: 0,
	retry: () => {},
	triggerSync: () => {},
});

export function useSyncQueueContext() {
	return useContext(SyncQueueContext);
}
