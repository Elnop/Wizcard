'use client';

import type { Card, CardEntry } from '@/types/cards';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { useCardEntryForm } from './useCardEntryForm';
import { CardEntryFormBody } from './CardEntryFormBody';
import styles from './EditCardModal.module.css';

export interface EditCardModalProps {
	card: Card;
	onSave: (patch: Partial<CardEntry>) => void;
	onChangePrint: (newCard: ScryfallCard) => void;
	onClose: () => void;
}

/** Modal for editing an existing owned copy (metadata + print/language). */
export function EditCardModal({ card, onSave, onChangePrint, onClose }: EditCardModalProps) {
	const form = useCardEntryForm({ ...card.entry }, card as ScryfallCard);

	function handleSave() {
		// Commit a print change (incl. localized language) before the metadata
		// patch. Both target the same rowId, so order is consistent.
		if (form.selectedPrint.id !== card.id) {
			onChangePrint(form.selectedPrint);
		}
		onSave(form.draftEntry);
		onClose();
	}

	return (
		<CardEntryFormBody
			title={`Edit copy — ${card.set?.toUpperCase() ?? ''} #${card.collector_number ?? ''}`}
			form={form}
			onClose={onClose}
			actions={
				<button type="button" className={styles.saveBtn} onClick={handleSave}>
					Sauvegarder
				</button>
			}
		/>
	);
}
