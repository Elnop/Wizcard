'use client';

import { useSyncQueueContext } from '@/lib/supabase/contexts/SyncQueueContext';
import styles from './SyncIndicator.module.css';

export function SyncIndicator() {
	const { syncStatus, failedCount, retry } = useSyncQueueContext();

	if (syncStatus === 'idle') return null;

	if (syncStatus === 'syncing') {
		return <span className={styles.spinner} title="Synchronisation en cours…" />;
	}

	// error state
	return (
		<button
			className={styles.errorBadge}
			onClick={retry}
			title="Erreur de synchronisation — cliquer pour réessayer"
		>
			{failedCount}
		</button>
	);
}
