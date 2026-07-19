'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/Modal/Modal';
import type { DeckFormat } from '@/types/decks';
import type { DeckSearchFilters } from '@/lib/search/types';
import { DEFAULT_DECK_FILTERS } from '@/lib/search/types';
import styles from './DeckFilterModal.module.css';

const ALL_FORMATS: DeckFormat[] = [
	'standard',
	'modern',
	'pioneer',
	'legacy',
	'vintage',
	'commander',
	'pauper',
	'draft',
	'limited',
	'oathbreaker',
	'brawl',
];

interface DeckFilterModalContentProps {
	initialFilters: DeckSearchFilters;
	onApply: (f: DeckSearchFilters) => void;
	onClose: () => void;
}

function DeckFilterModalContent({ initialFilters, onApply, onClose }: DeckFilterModalContentProps) {
	const t = useTranslations('search');
	const [draft, setDraft] = useState<DeckSearchFilters>(initialFilters);

	const toggleFormat = (fmt: DeckFormat) => {
		setDraft((d) => ({
			...d,
			formats: d.formats.includes(fmt) ? d.formats.filter((x) => x !== fmt) : [...d.formats, fmt],
		}));
	};

	const apply = () => {
		onApply(draft);
		onClose();
	};

	return (
		<Modal onClose={onClose} className={styles.panel}>
			<div className={styles.header}>
				<span className={styles.title}>{t('filters')}</span>
				<button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path
							d="M12 4L4 12M4 4l8 8"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
						/>
					</svg>
				</button>
			</div>

			<div className={styles.body}>
				<label className={styles.field}>
					<span>{t('deckNameLabel')}</span>
					<input
						type="text"
						value={draft.name}
						onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
					/>
				</label>

				<fieldset className={styles.field}>
					<legend>{t('deckFormatLabel')}</legend>
					<div className={styles.formatGrid}>
						{ALL_FORMATS.map((fmt) => (
							<button
								key={fmt}
								type="button"
								className={`${styles.chip} ${draft.formats.includes(fmt) ? styles.chipActive : ''}`}
								aria-pressed={draft.formats.includes(fmt)}
								onClick={() => toggleFormat(fmt)}
							>
								{fmt}
							</button>
						))}
					</div>
				</fieldset>

				<label className={styles.field}>
					<span>{t('deckAuthorLabel')}</span>
					<input
						type="text"
						placeholder={t('deckAuthorPlaceholder')}
						value={draft.authorNickname}
						onChange={(e) => setDraft((d) => ({ ...d, authorNickname: e.target.value }))}
					/>
				</label>

				<fieldset className={styles.field}>
					<legend>{t('preconFilterLabel')}</legend>
					<div className={styles.formatGrid}>
						{(['all', 'only', 'exclude'] as const).map((value) => (
							<button
								key={value}
								type="button"
								className={`${styles.chip} ${draft.precon === value ? styles.chipActive : ''}`}
								aria-pressed={draft.precon === value}
								onClick={() => setDraft((d) => ({ ...d, precon: value }))}
							>
								{t(`preconFilter_${value}`)}
							</button>
						))}
					</div>
				</fieldset>
			</div>

			<div className={styles.footer}>
				<button
					type="button"
					className={styles.resetButton}
					onClick={() => setDraft(DEFAULT_DECK_FILTERS)}
				>
					{t('reset')}
				</button>
				<button type="button" className={styles.applyButton} onClick={apply}>
					{t('apply')}
				</button>
			</div>
		</Modal>
	);
}

interface DeckFilterModalProps {
	isOpen: boolean;
	filters: DeckSearchFilters;
	onApply: (f: DeckSearchFilters) => void;
	onClose: () => void;
}

export function DeckFilterModal({ isOpen, filters, onApply, onClose }: DeckFilterModalProps) {
	if (!isOpen) return null;

	return (
		<DeckFilterModalContent
			key={String(isOpen)}
			initialFilters={filters}
			onApply={onApply}
			onClose={onClose}
		/>
	);
}
