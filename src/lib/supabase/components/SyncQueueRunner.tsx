'use client';

import { useSyncQueue } from '@/lib/supabase/hooks/useSyncQueue';
import { SyncQueueContext } from '@/lib/supabase/contexts/SyncQueueContext';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';

export function SyncQueueRunner({ children }: { children: React.ReactNode }) {
	const { user } = useAuth();
	const value = useSyncQueue(user?.id);

	return <SyncQueueContext.Provider value={value}>{children}</SyncQueueContext.Provider>;
}
