'use client';

import { useEffect, useRef, useState } from 'react';
import { useSyncQueueContext } from '@/lib/supabase/contexts/SyncQueueContext';
import styles from './SyncIndicator.module.css';

function friendlyErrorMessage(raw: string): string {
	const lower = raw.toLowerCase();
	if (lower.includes('relation') && lower.includes('does not exist')) {
		return 'The table does not exist on the server. The migrations have probably not been applied.';
	}
	if (lower.includes('permission denied') || lower.includes('row-level security')) {
		return 'Permission denied. Check the database RLS policies.';
	}
	if (lower.includes('network') || lower.includes('failed to fetch')) {
		return 'Network error. Check your internet connection.';
	}
	return raw;
}

export function SyncIndicator() {
	const { syncStatus, failedCount, lastError, retry, dismiss } = useSyncQueueContext();
	const [isOpen, setIsOpen] = useState(false);
	const popoverRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!isOpen) return;
		function handleClick(e: MouseEvent) {
			if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
				setIsOpen(false);
			}
		}
		document.addEventListener('mousedown', handleClick);
		return () => document.removeEventListener('mousedown', handleClick);
	}, [isOpen]);

	if (syncStatus === 'idle') return null;

	if (syncStatus === 'syncing') {
		return <span className={styles.spinner} title="Synchronisation en cours…" />;
	}

	const friendly = lastError ? friendlyErrorMessage(lastError) : null;
	const showRaw = friendly && friendly !== lastError;

	return (
		<div className={styles.popoverWrapper} ref={popoverRef}>
			<button className={styles.errorBadge} onClick={() => setIsOpen((v) => !v)} title="Sync error">
				{failedCount}
			</button>
			{isOpen && (
				<div className={styles.popover}>
					<p className={styles.popoverTitle}>Erreur de synchronisation</p>
					{friendly && <p className={styles.popoverMessage}>{friendly}</p>}
					{showRaw && <p className={styles.popoverRaw}>{lastError}</p>}
					<div className={styles.popoverActions}>
						<button
							className={styles.popoverBtn}
							onClick={() => {
								setIsOpen(false);
								retry();
							}}
						>
							Retry
						</button>
						<button
							className={styles.popoverBtnGhost}
							onClick={() => {
								setIsOpen(false);
								dismiss();
							}}
						>
							Ignorer
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
