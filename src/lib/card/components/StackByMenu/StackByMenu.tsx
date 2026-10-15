'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { StackBy, StackCriterion } from '@/types/cards';
import { STACK_CRITERIA } from '@/lib/card/utils/group-cards';
import styles from './StackByMenu.module.css';

type Props = {
	value: StackBy;
	onChange: (next: StackBy) => void;
};

/**
 * "Stack by" popover: no stacking, or the card name plus any copy properties.
 * Applies on every click. Remembers the last criteria so switching back from
 * "don't stack" restores them.
 */
export function StackByMenu({ value, onChange }: Props) {
	const t = useTranslations('stacking');
	const [open, setOpen] = useState(false);
	const [lastCriteria, setLastCriteria] = useState<StackCriterion[]>(value === 'copy' ? [] : value);
	const rootRef = useRef<HTMLDivElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const panelId = useId();

	const unstacked = value === 'copy';
	const criteria = unstacked ? lastCriteria : value;

	useEffect(() => {
		if (!open) return;
		const onPointer = (e: MouseEvent) => {
			if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				setOpen(false);
				buttonRef.current?.focus();
			}
		};
		document.addEventListener('mousedown', onPointer);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('mousedown', onPointer);
			document.removeEventListener('keydown', onKey);
		};
	}, [open]);

	let summary: string;
	if (unstacked) summary = t('unstacked');
	else if (value.length > 2)
		summary = t('button', { summary: t('nameAndMore', { count: value.length }) });
	else summary = t('button', { summary: [t('name'), ...value.map((c) => t(c))].join(' + ') });

	function setUnstacked(on: boolean) {
		if (on) {
			if (value !== 'copy') setLastCriteria(value);
			onChange('copy');
		} else {
			onChange(lastCriteria);
		}
	}

	function toggleCriterion(c: StackCriterion) {
		const next = criteria.includes(c) ? criteria.filter((x) => x !== c) : [...criteria, c];
		const ordered = STACK_CRITERIA.filter((x) => next.includes(x));
		setLastCriteria(ordered);
		onChange(ordered);
	}

	return (
		<div className={styles.root} ref={rootRef}>
			<button
				ref={buttonRef}
				type="button"
				className={styles.trigger}
				aria-expanded={open}
				aria-controls={panelId}
				onClick={() => setOpen((o) => !o)}
			>
				{summary}
				<span aria-hidden="true" className={styles.caret}>
					▾
				</span>
			</button>
			{open && (
				<div id={panelId} className={styles.panel}>
					<label className={styles.row}>
						<input
							type="radio"
							name={`${panelId}-mode`}
							checked={unstacked}
							onChange={() => setUnstacked(true)}
						/>
						{t('noStack')}
					</label>
					<label className={styles.row}>
						<input
							type="radio"
							name={`${panelId}-mode`}
							checked={!unstacked}
							onChange={() => setUnstacked(false)}
						/>
						{t('stackBy')}
					</label>
					<div className={styles.criteria}>
						<label className={`${styles.row} ${styles.disabled}`}>
							<input type="checkbox" checked disabled />
							{t('nameAlways')}
						</label>
						{STACK_CRITERIA.map((c) => (
							<label key={c} className={`${styles.row} ${unstacked ? styles.disabled : ''}`}>
								<input
									type="checkbox"
									checked={criteria.includes(c)}
									disabled={unstacked}
									onChange={() => toggleCriterion(c)}
								/>
								{t(c)}
							</label>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
