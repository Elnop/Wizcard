'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/Modal/Modal';
import { Button } from '@/components/Button/Button';
import type { DeckZone } from '@/types/decks';
import type { AddDeckToCollectionOptions, ZoneStat } from '../../useAddDeckToCollection';
import styles from './AddDeckToCollectionModal.module.css';

const ZONE_LABELS: Record<DeckZone, string> = {
	commander: 'Commander',
	mainboard: 'Mainboard',
	sideboard: 'Sideboard',
	maybeboard: 'Maybeboard',
	tokens: 'Tokens',
};

const DEFAULT_SELECTED: Set<DeckZone> = new Set(['commander', 'mainboard', 'sideboard']);

type Props = {
	zoneStats: Record<DeckZone, ZoneStat>;
	availableZones: DeckZone[];
	onConfirm: (options: AddDeckToCollectionOptions) => void;
	onClose: () => void;
};

export function AddDeckToCollectionModal({ zoneStats, availableZones, onConfirm, onClose }: Props) {
	const t = useTranslations('decks');
	const [selectedZones, setSelectedZones] = useState<Set<DeckZone>>(
		() => new Set(availableZones.filter((z) => DEFAULT_SELECTED.has(z)))
	);

	const totalInSelectedZones = useMemo(
		() =>
			availableZones
				.filter((z) => selectedZones.has(z))
				.reduce((sum, z) => sum + zoneStats[z].total, 0),
		[availableZones, selectedZones, zoneStats]
	);

	const ownedInSelectedZones = useMemo(
		() =>
			availableZones
				.filter((z) => selectedZones.has(z))
				.reduce((sum, z) => sum + zoneStats[z].owned, 0),
		[availableZones, selectedZones, zoneStats]
	);

	const unownedInSelectedZones = totalInSelectedZones - ownedInSelectedZones;

	const basicsInSelectedZones = useMemo(
		() =>
			availableZones
				.filter((z) => selectedZones.has(z))
				.reduce((sum, z) => sum + zoneStats[z].basics, 0),
		[availableZones, selectedZones, zoneStats]
	);

	const unownedBasicsInSelectedZones = useMemo(
		() =>
			availableZones
				.filter((z) => selectedZones.has(z))
				.reduce((sum, z) => sum + zoneStats[z].unownedBasics, 0),
		[availableZones, selectedZones, zoneStats]
	);

	const hasAnyOwned = ownedInSelectedZones > 0;
	const [onlyMissing, setOnlyMissing] = useState(hasAnyOwned);
	const [asProxy, setAsProxy] = useState(false);
	const [ignoreBasicLands, setIgnoreBasicLands] = useState(false);

	const base = onlyMissing ? unownedInSelectedZones : totalInSelectedZones;
	const basicsToExclude = onlyMissing ? unownedBasicsInSelectedZones : basicsInSelectedZones;
	const addCount = ignoreBasicLands ? Math.max(0, base - basicsToExclude) : base;

	const toggleZone = (zone: DeckZone) => {
		setSelectedZones((prev) => {
			const next = new Set(prev);
			if (next.has(zone)) next.delete(zone);
			else next.add(zone);
			return next;
		});
	};

	return (
		<Modal onClose={onClose} className={styles.dialog} zIndex={1100}>
			<h2 className={styles.title}>{t('addDeckToCollection2')}</h2>
			<p className={styles.summary}>
				{t.rich('toAddCount', {
					count: addCount,
					strong: (chunks) => <strong>{chunks}</strong>,
				})}
			</p>

			<div className={styles.section}>
				<p className={styles.sectionTitle}>{t('zones')}</p>
				<div className={styles.options}>
					{availableZones.map((zone) => {
						const stat = zoneStats[zone];
						return (
							<label key={zone} className={styles.option}>
								<input
									type="checkbox"
									checked={selectedZones.has(zone)}
									onChange={() => toggleZone(zone)}
								/>
								{ZONE_LABELS[zone]}
								<span className={styles.zoneCount}>
									{t('ownedFraction', { owned: stat.owned, total: stat.total })}
								</span>
							</label>
						);
					})}
				</div>
			</div>

			<div className={styles.section}>
				<p className={styles.sectionTitle}>{t('options')}</p>
				<div className={styles.options}>
					{hasAnyOwned && (
						<label className={styles.option}>
							<input
								type="checkbox"
								checked={onlyMissing}
								onChange={(e) => setOnlyMissing(e.target.checked)}
							/>
							{t('onlyUnowned', { count: unownedInSelectedZones })}
						</label>
					)}
					{basicsInSelectedZones > 0 && (
						<label className={styles.option}>
							<input
								type="checkbox"
								checked={ignoreBasicLands}
								onChange={(e) => setIgnoreBasicLands(e.target.checked)}
							/>
							{t('skipBasicLandsCount', { count: basicsInSelectedZones })}
						</label>
					)}
					<label className={styles.option}>
						<input
							type="checkbox"
							checked={asProxy}
							onChange={(e) => setAsProxy(e.target.checked)}
						/>
						{t('markAsProxy')}
					</label>
				</div>
			</div>

			<div className={styles.actions}>
				<Button variant="secondary" size="sm" onClick={onClose}>
					{t('cancel')}
				</Button>
				<Button
					variant="primary"
					size="sm"
					onClick={() =>
						onConfirm({
							onlyMissing: onlyMissing && hasAnyOwned,
							asProxy,
							ignoreBasicLands,
							zones: Array.from(selectedZones),
						})
					}
					disabled={addCount === 0 || selectedZones.size === 0}
				>
					{t('add')}
				</Button>
			</div>
		</Modal>
	);
}
