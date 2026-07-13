'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/Modal/Modal';
import { Button } from '@/components/Button/Button';
import { CardList } from '@/lib/card/components/CardList/CardList';
import type { DeckZone } from '@/types/decks';
import type { DeckPdfExportOptions } from '@/lib/pdf/types';
import type { ResolvedDeckCard } from '../../useDeckDetail';
import { filterCardsForPdf } from '@/lib/pdf/filterCardsForPdf';
import styles from './DeckPdfExportModal.module.css';

const ZONE_LABELS: Record<DeckZone, string> = {
	commander: 'Commander',
	mainboard: 'Mainboard',
	sideboard: 'Sideboard',
	maybeboard: 'Maybeboard',
	tokens: 'Tokens',
};

const DEFAULT_SELECTED: Set<DeckZone> = new Set(['commander', 'mainboard', 'sideboard', 'tokens']);

type Props = {
	availableZones: DeckZone[];
	cards: ResolvedDeckCard[];
	onConfirm: (options: DeckPdfExportOptions) => void;
	onClose: () => void;
};

export function DeckPdfExportModal({ availableZones, cards, onConfirm, onClose }: Props) {
	const t = useTranslations('decks');
	const [selectedZones, setSelectedZones] = useState<Set<DeckZone>>(
		() => new Set(availableZones.filter((z) => DEFAULT_SELECTED.has(z)))
	);
	const [ignoreOwned, setIgnoreOwned] = useState(false);
	const [ignoreBasicLands, setIgnoreBasicLands] = useState(true);

	const toggleZone = (zone: DeckZone) => {
		setSelectedZones((prev) => {
			const next = new Set(prev);
			if (next.has(zone)) next.delete(zone);
			else next.add(zone);
			return next;
		});
	};

	const options = useMemo(
		() => ({
			zones: Array.from(selectedZones),
			ignoreOwned,
			ignoreBasicLands,
		}),
		[selectedZones, ignoreOwned, ignoreBasicLands]
	);

	const filteredCards = useMemo(() => filterCardsForPdf(cards, options), [cards, options]);
	const customCards = useMemo(
		() => filteredCards.filter((c) => c.entry.tags?.includes('custom:mpc')),
		[filteredCards]
	);
	const officialCards = useMemo(
		() => filteredCards.filter((c) => !c.entry.tags?.includes('custom:mpc')),
		[filteredCards]
	);

	return (
		<Modal onClose={onClose} className={styles.dialog} zIndex={1100}>
			<h2 className={styles.title}>{t('generateAPdf')}</h2>

			<div className={styles.controls}>
				<div className={styles.section}>
					<p className={styles.sectionTitle}>{t('zones')}</p>
					<div className={styles.options}>
						{availableZones.map((zone) => (
							<label key={zone} className={styles.option}>
								<input
									type="checkbox"
									checked={selectedZones.has(zone)}
									onChange={() => toggleZone(zone)}
								/>
								{ZONE_LABELS[zone]}
							</label>
						))}
					</div>
				</div>

				<div className={styles.section}>
					<p className={styles.sectionTitle}>{t('options')}</p>
					<div className={styles.options}>
						<label className={styles.option}>
							<input
								type="checkbox"
								checked={ignoreOwned}
								onChange={(e) => setIgnoreOwned(e.target.checked)}
							/>
							{t('skipOwnedCards')}
						</label>
						<label className={styles.option}>
							<input
								type="checkbox"
								checked={ignoreBasicLands}
								onChange={(e) => setIgnoreBasicLands(e.target.checked)}
							/>
							{t('skipBasicLands')}
						</label>
					</div>
				</div>
			</div>

			<div className={styles.preview}>
				<p className={styles.sectionTitle}>
					{t('cardCount2', { count: filteredCards.length })}
					{customCards.length > 0 && (
						<span className={styles.customBadge}>
							{t('proxyMpc', { count: customCards.length })}
						</span>
					)}
				</p>
				{officialCards.length > 0 && (
					<div className={styles.cardListWrapper}>
						<CardList cards={officialCards} viewModes={['grid', 'table']} pageSize={false} />
					</div>
				)}
				{customCards.length > 0 && (
					<>
						<p className={styles.sectionSubtitle}>{t('customMpc')}</p>
						<div className={styles.cardListWrapper}>
							<CardList cards={customCards} viewModes={['grid', 'table']} pageSize={false} />
						</div>
					</>
				)}
			</div>

			<div className={styles.actions}>
				<Button variant="secondary" size="sm" onClick={onClose}>
					{t('cancel')}
				</Button>
				<Button
					variant="primary"
					size="sm"
					onClick={() => onConfirm(options)}
					disabled={filteredCards.length === 0}
				>
					Next ({filteredCards.length})
				</Button>
			</div>
		</Modal>
	);
}
