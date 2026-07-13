'use client';

import { useEffect, useRef, useState } from 'react';
import { useSyncQueueContext } from '@/lib/supabase/contexts/SyncQueueContext';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Per-section save indicator derived from the shared sync queue. A field change
 * calls markSaving(); we then watch the queue status: 'error' -> error, and the
 * transition back to 'idle' after a save -> a brief 'saved' pulse.
 */
export function useSaveStatus(): { status: SaveStatus; markSaving: () => void } {
	const { syncStatus: queueStatus } = useSyncQueueContext();
	const [pulse, setPulse] = useState<'idle' | 'saving' | 'saved'>('idle');
	const pendingRef = useRef(false);

	const markSaving = () => {
		pendingRef.current = true;
		setPulse('saving');
	};

	useEffect(() => {
		if (queueStatus === 'error') {
			pendingRef.current = false;
			return;
		}
		if (queueStatus === 'idle' && pendingRef.current) {
			pendingRef.current = false;
			const timers: ReturnType<typeof setTimeout>[] = [];
			timers.push(setTimeout(() => setPulse('saved'), 0));
			timers.push(setTimeout(() => setPulse('idle'), 2000));
			return () => timers.forEach(clearTimeout);
		}
	}, [queueStatus]);

	const status: SaveStatus = queueStatus === 'error' ? 'error' : pulse;

	return { status, markSaving };
}
