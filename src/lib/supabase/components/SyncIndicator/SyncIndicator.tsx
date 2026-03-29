'use client';

import { useEffect, useRef, useState } from 'react';
import { useSyncQueueContext } from '@/lib/supabase/contexts/SyncQueueContext';
import styles from './SyncIndicator.module.css';

function friendlyErrorMessage(raw: string): string {
	const lower = raw.toLowerCase();
	if (lower.includes('relation') && lower.includes('does not exist')) {
		return "La table n'existe pas sur le serveur. Les migrations n'ont probablement pas été appliquées.";
	}
	if (lower.includes('permission denied') || lower.includes('row-level security')) {
		return 'Permission refusée. Vérifiez les politiques RLS de la base de données.';
	}
	if (lower.includes('network') || lower.includes('failed to fetch')) {
		return 'Erreur réseau. Vérifiez votre connexion internet.';
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
			<button
				className={styles.errorBadge}
				onClick={() => setIsOpen((v) => !v)}
				title="Erreur de synchronisation"
			>
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
							Réessayer
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
