'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
	insertEntry,
	insertEntries,
	deleteEntryById,
	updateEntry,
} from '@/lib/collection/db/collection';
import { createClient } from '@/lib/supabase/client';
import {
	peek,
	dequeue,
	incrementRetry,
	clearFailed,
	getFailedCount,
	getQueueLength,
	skipFailed,
} from '@/lib/supabase/sync-queue';

const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000;

export type SyncStatus = 'idle' | 'syncing' | 'error';

function isAuthError(err: unknown): boolean {
	if (!err || typeof err !== 'object') return false;
	const message = (err as { message?: string }).message ?? '';
	return (
		message.includes('401') || message.includes('JWT') || message.toLowerCase().includes('auth')
	);
}

export function useSyncQueue(userId: string | null | undefined) {
	const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
	const [failedCount, setFailedCount] = useState(0);
	const isRunning = useRef(false);

	const refreshStatus = useCallback(() => {
		const failed = getFailedCount(MAX_RETRIES);
		setFailedCount(failed);
		const pending = getQueueLength() - failed;
		if (failed > 0) {
			setSyncStatus('error');
		} else if (pending > 0) {
			setSyncStatus('syncing');
		} else {
			setSyncStatus('idle');
		}
	}, []);

	const runQueue = useCallback(async () => {
		if (!userId || isRunning.current) return;
		isRunning.current = true;

		while (true) {
			const op = peek();
			if (!op) break;

			// P0-A: Skip permanently failed ops (move to end) instead of blocking
			if (op.retries >= MAX_RETRIES) {
				skipFailed(op.id, MAX_RETRIES);
				// If the new head is also failed, we've cycled through all failed ops — stop
				const next = peek();
				if (!next || next.retries >= MAX_RETRIES) break;
				continue;
			}

			setSyncStatus('syncing');

			// P0-B: Verify session before executing op
			const supabase = createClient();
			const {
				data: { session },
			} = await supabase.auth.getSession();
			if (!session) {
				isRunning.current = false;
				refreshStatus();
				return;
			}

			try {
				if (op.type === 'insert') {
					await insertEntry(op.payload.userId, op.payload.scryfallId, op.payload.entry);
				} else if (op.type === 'delete') {
					await deleteEntryById(op.payload.userId, op.payload.rowId);
				} else if (op.type === 'bulk-insert') {
					await insertEntries(op.payload.userId, op.payload.rows);
				} else {
					await updateEntry(op.payload.userId, op.payload.rowId, op.payload.entry);
				}
				dequeue();
			} catch (err) {
				// P0-B: Auth errors refresh session without consuming a retry
				if (isAuthError(err)) {
					const { error: refreshError } = await supabase.auth.refreshSession();
					if (refreshError) {
						isRunning.current = false;
						refreshStatus();
						return;
					}
					continue;
				}
				const delay = BACKOFF_BASE_MS * Math.pow(2, op.retries);
				incrementRetry(op.id);
				refreshStatus();
				await new Promise((resolve) => setTimeout(resolve, delay));

				const updated = peek();
				if (!updated || updated.id !== op.id || updated.retries >= MAX_RETRIES) {
					// P0-A: Don't break — skipFailed at top of loop will handle it
					continue;
				}
			}
		}

		isRunning.current = false;
		refreshStatus();
	}, [userId, refreshStatus]);

	// Trigger processing when userId or online status changes
	useEffect(() => {
		if (!userId) return;

		setTimeout(() => refreshStatus(), 0);

		const handleOnline = () => void runQueue();
		window.addEventListener('online', handleOnline);

		if (navigator.onLine) {
			setTimeout(() => void runQueue(), 0);
		}

		return () => {
			window.removeEventListener('online', handleOnline);
		};
	}, [userId, runQueue, refreshStatus]);

	const retry = useCallback(() => {
		clearFailed(MAX_RETRIES);
		refreshStatus();
		void runQueue();
	}, [runQueue, refreshStatus]);

	// Expose a trigger so external code can kick processing
	const triggerSync = useCallback(() => {
		if (navigator.onLine) void runQueue();
	}, [runQueue]);

	return { syncStatus, failedCount, retry, triggerSync };
}
