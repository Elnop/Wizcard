'use client';

import { useEffect, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import styles from './BulkActionBar.module.css';

export type BulkAction = {
	id: string;
	label: ReactNode;
	onClick: () => void;
	danger?: boolean;
};

type Props = {
	/** Counter text, e.g. "12 cartes · 31 copies". */
	summary: string;
	allSelected: boolean;
	selectAllDisabled?: boolean;
	onToggleSelectAll: () => void;
	/** Per-selection actions, disabled while nothing is selected. */
	actions: BulkAction[];
	hasSelection: boolean;
	onClear: () => void;
	/** Leave selection mode entirely (clears the selection too). */
	onExit: () => void;
	/** True while a modal is open on top: Escape then belongs to the modal. */
	escapeDisabled?: boolean;
};

/** Floating action bar shown while a list is in bulk-selection mode. */
export function BulkActionBar({
	summary,
	allSelected,
	selectAllDisabled = false,
	onToggleSelectAll,
	actions,
	hasSelection,
	onClear,
	onExit,
	escapeDisabled = false,
}: Props) {
	const t = useTranslations('bulk');

	useEffect(() => {
		if (escapeDisabled) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== 'Escape' || e.defaultPrevented) return;
			const target = e.target instanceof Element ? e.target : null;
			if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
			onExit();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [escapeDisabled, onExit]);

	return (
		<div className={styles.bar}>
			<button
				type="button"
				className={styles.exit}
				onClick={onExit}
				aria-label={t('exitSelectionMode')}
				title={t('exitSelectionMode')}
			>
				<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<path
						d="M2 2l12 12M14 2L2 14"
						stroke="currentColor"
						strokeWidth="1.8"
						strokeLinecap="round"
					/>
				</svg>
			</button>

			<span className={styles.count}>{summary}</span>

			<button
				type="button"
				className={styles.action}
				onClick={onToggleSelectAll}
				disabled={selectAllDisabled}
			>
				{allSelected ? t('deselectAll') : t('selectAll')}
			</button>

			<span className={styles.divider} aria-hidden="true" />

			{actions.map((action) => (
				<button
					key={action.id}
					type="button"
					className={action.danger ? `${styles.action} ${styles.danger}` : styles.action}
					onClick={action.onClick}
					disabled={!hasSelection}
				>
					{action.label}
				</button>
			))}

			<span className={styles.divider} aria-hidden="true" />

			<button type="button" className={styles.clear} onClick={onClear} disabled={!hasSelection}>
				{t('clear')}
			</button>
		</div>
	);
}
