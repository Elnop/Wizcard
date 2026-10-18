'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { DeckZone } from '@/types/decks';
import { ZONE_LABELS } from '@/lib/deck/utils/zonesForFormat';
import { BulkEditModal } from '@/lib/card/bulk/BulkEditModal';
import type { BulkEdit, BulkField } from '@/lib/card/bulk/bulk-edit';
import styles from '@/lib/card/bulk/BulkEditModal.module.css';

const DECK_FIELDS: readonly BulkField[] = [
	'tagsAdd',
	'tagsRemove',
	'condition',
	'language',
	'finish',
	'proxy',
	'forTrade',
	'alter',
];

export type DeckBulkEdit = {
	edit: BulkEdit;
	/** Target zone applied as the deck zone tag, if chosen. */
	zone?: DeckZone;
};

type Props = {
	cardCount: number;
	/** Zones offered as move targets (commander only when the deck supports it). */
	zones: DeckZone[];
	onApply: (edit: DeckBulkEdit) => void;
	onClose: () => void;
};

/** Deck flavour of the shared bulk-edit modal: adds the zone picker. */
export function DeckBulkEditModal({ cardCount, zones, onApply, onClose }: Props) {
	const t = useTranslations('decks');
	const tBulk = useTranslations('bulk');
	const [zone, setZone] = useState<DeckZone | ''>('');

	return (
		<BulkEditModal
			title={t('editNCards', { count: cardCount })}
			fields={DECK_FIELDS}
			extraHasChanges={zone !== ''}
			extraFields={
				<div className={styles.field}>
					<label className={styles.label} htmlFor="bulk-edit-zone">
						{tBulk('zone')}
					</label>
					<select
						id="bulk-edit-zone"
						className={styles.select}
						value={zone}
						onChange={(e) => setZone(e.target.value as DeckZone | '')}
					>
						<option value="">{tBulk('leaveUnchanged')}</option>
						{zones.map((z) => (
							<option key={z} value={z}>
								{ZONE_LABELS[z]}
							</option>
						))}
					</select>
				</div>
			}
			onApply={(edit) => onApply({ edit, zone: zone || undefined })}
			onClose={onClose}
		/>
	);
}
