'use client';

import { createContext, useContext } from 'react';
import type { SyncStatus } from '@/lib/supabase/useSyncQueue';

type SyncQueueContextValue = {
	syncStatus: SyncStatus;
	failedCount: number;
	lastError: string | null;
	retry: () => void;
	dismiss: () => void;
	triggerSync: () => void;
};

export const SyncQueueContext = createContext<SyncQueueContextValue>({
	syncStatus: 'idle',
	failedCount: 0,
	lastError: null,
	retry: () => {},
	dismiss: () => {},
	triggerSync: () => {},
});

export function useSyncQueueContext() {
	return useContext(SyncQueueContext);
}
