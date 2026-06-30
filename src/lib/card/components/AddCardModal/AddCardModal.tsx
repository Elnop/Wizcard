'use client';

import { useState } from 'react';
import type { CardEntry } from '@/types/cards';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { type DeckZone, setDeckZone } from '@/types/decks';
import { useCardEntryForm } from '@/lib/card/components/EditCardModal/useCardEntryForm';
import { CardEntryFormBody } from '@/lib/card/components/EditCardModal/CardEntryFormBody';
import styles from '@/lib/card/components/EditCardModal/EditCardModal.module.css';

const ZONE_LABELS: Record<DeckZone, string> = {
	mainboard: 'Mainboard',
	sideboard: 'Sideboard',
	maybeboard: 'Maybeboard',
	commander: 'Commander',
	tokens: 'Tokens',
};

export interface AddCardModalProps {
	scryfallCard: ScryfallCard;
	onAdd: (card: ScryfallCard, entry: Partial<CardEntry>, count: number) => void;
	onClose: () => void;
	availableZones?: DeckZone[];
	defaultZone?: DeckZone;
	hideQuantity?: boolean;
	maxQuantity?: number;
	initialEntry?: Partial<CardEntry>;
}

/** Modal for adding a new copy of a card to the collection / wishlist / deck. */
export function AddCardModal({
	scryfallCard,
	onAdd,
	onClose,
	availableZones,
	defaultZone,
	hideQuantity,
	maxQuantity,
	initialEntry,
}: AddCardModalProps) {
	const initialZone: DeckZone = defaultZone ?? 'mainboard';
	const form = useCardEntryForm(
		{ ...initialEntry, tags: setDeckZone(initialEntry?.tags, initialZone) },
		scryfallCard
	);
	const [quantity, setQuantity] = useState(1);

	const entry = form.draftEntry;

	function handleConfirmAdd() {
		onAdd(form.selectedPrint, form.draftEntry, quantity);
		onClose();
	}

	const topExtras = (
		<>
			{!hideQuantity && (
				<div className={styles.field}>
					<label className={styles.label} htmlFor="copy-add-quantity">
						Quantity
					</label>
					<input
						id="copy-add-quantity"
						type="number"
						min={1}
						max={maxQuantity}
						step={1}
						className={styles.select}
						value={quantity}
						onChange={(e) => {
							const n = parseInt(e.target.value, 10);
							const clamped = Number.isNaN(n) ? 1 : Math.max(1, n);
							setQuantity(maxQuantity !== undefined ? Math.min(maxQuantity, clamped) : clamped);
						}}
					/>
				</div>
			)}

			{availableZones && availableZones.length > 1 && (
				<div className={styles.field}>
					<label className={styles.label} htmlFor="copy-add-zone">
						Zone
					</label>
					<select
						id="copy-add-zone"
						className={styles.select}
						value={
							(entry.tags ?? []).find((t) => t.startsWith('deck:'))?.replace('deck:', '') ??
							initialZone
						}
						onChange={(e) =>
							form.save({ tags: setDeckZone(entry.tags, e.target.value as DeckZone) })
						}
					>
						{availableZones.map((z) => (
							<option key={z} value={z}>
								{ZONE_LABELS[z]}
							</option>
						))}
					</select>
				</div>
			)}
		</>
	);

	return (
		<CardEntryFormBody
			title={`Add — ${form.selectedPrint.set_name} #${form.selectedPrint.collector_number}`}
			form={form}
			onClose={onClose}
			topExtras={topExtras}
			actions={
				<button type="button" className={styles.changePrintBtn} onClick={handleConfirmAdd}>
					Confirmer l&apos;ajout
				</button>
			}
		/>
	);
}
