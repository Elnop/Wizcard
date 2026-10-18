// src/app/[locale]/collection/lib/BulkAddToDeckModal/BulkAddToDeckModal.tsx
'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Modal } from '@/components/Modal/Modal';
import type { CardEntry } from '@/types/cards';
import type { DeckZone } from '@/types/decks';
import { useDeckContext } from '@/lib/deck/context/DeckContext';
import { zonesForFormat, ZONE_LABELS } from '@/lib/deck/utils/zonesForFormat';
import { planAssignToDeck, summarizeAssign } from '@/lib/collection/bulk-plans';
import styles from '@/lib/card/bulk/BulkEditModal.module.css';

type Props = {
	copies: Array<{ rowId: string; entry: CardEntry }>;
	onConfirm: (deckId: string, zone: DeckZone) => void;
	onClose: () => void;
};

/** Pick a deck + zone for the selected collection copies; states what will move. */
export function BulkAddToDeckModal({ copies, onConfirm, onClose }: Props) {
	const t = useTranslations('bulk');
	const { decks } = useDeckContext();
	const sortedDecks = useMemo(
		() => [...decks].sort((a, b) => a.name.localeCompare(b.name)),
		[decks]
	);
	const [deckId, setDeckId] = useState(sortedDecks[0]?.id ?? '');
	const effectiveDeckId = sortedDecks.some((d) => d.id === deckId)
		? deckId
		: (sortedDecks[0]?.id ?? '');
	const selectedDeck = sortedDecks.find((d) => d.id === effectiveDeckId) ?? null;
	const zones = useMemo(() => zonesForFormat(selectedDeck?.format), [selectedDeck?.format]);
	const [zone, setZone] = useState<DeckZone>('mainboard');
	const effectiveZone = zones.includes(zone) ? zone : zones[0];

	const summary = useMemo(
		() => summarizeAssign(planAssignToDeck(copies, effectiveDeckId, effectiveZone)),
		[copies, effectiveDeckId, effectiveZone]
	);
	const deckName = (id: string) => decks.find((d) => d.id === id)?.name ?? '?';

	return (
		<Modal onClose={onClose} className={styles.modal} zIndex={1100}>
			<div className={styles.header}>
				<span className={styles.title}>{t('addToDeckTitle', { count: copies.length })}</span>
			</div>

			{sortedDecks.length === 0 ? (
				<div className={styles.body}>
					<p className={styles.hint}>{t('noDecks')}</p>
					<Link href="/decks">{t('goToDecks')}</Link>
				</div>
			) : (
				<div className={styles.body}>
					<div className={styles.grid}>
						<div className={styles.field}>
							<label className={styles.label} htmlFor="bulk-deck">
								{t('deck')}
							</label>
							<select
								id="bulk-deck"
								className={styles.select}
								value={effectiveDeckId}
								onChange={(e) => setDeckId(e.target.value)}
							>
								{sortedDecks.map((d) => (
									<option key={d.id} value={d.id}>
										{d.name}
									</option>
								))}
							</select>
						</div>
						<div className={styles.field}>
							<label className={styles.label} htmlFor="bulk-deck-zone">
								{t('zone')}
							</label>
							<select
								id="bulk-deck-zone"
								className={styles.select}
								value={effectiveZone}
								onChange={(e) => setZone(e.target.value as DeckZone)}
							>
								{zones.map((z) => (
									<option key={z} value={z}>
										{ZONE_LABELS[z]}
									</option>
								))}
							</select>
						</div>
					</div>
					{[...summary.movedByDeck].map(([fromId, count]) => (
						<p key={fromId} className={styles.hint}>
							{t('movedFromDeck', { count, deck: deckName(fromId) })}
						</p>
					))}
					{summary.same > 0 && (
						<p className={styles.hint}>{t('alreadyInDeck', { count: summary.same })}</p>
					)}
				</div>
			)}

			<div className={styles.footer}>
				<button type="button" className={styles.cancelBtn} onClick={onClose}>
					{t('cancel')}
				</button>
				<button
					type="button"
					className={styles.applyBtn}
					disabled={!effectiveDeckId || copies.length === 0}
					onClick={() => {
						onConfirm(effectiveDeckId, effectiveZone);
						onClose();
					}}
				>
					{t('confirm')}
				</button>
			</div>
		</Modal>
	);
}
