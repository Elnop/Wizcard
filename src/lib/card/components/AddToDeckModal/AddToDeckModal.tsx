'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Modal } from '@/components/Modal/Modal';
import { CardImage } from '@/lib/card/components/CardImage/CardImage';
import { useDeckContext } from '@/lib/deck/context/DeckContext';
import { zonesForFormat, ZONE_LABELS } from '@/lib/deck/utils/zonesForFormat';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { DeckZone } from '@/types/decks';
import styles from './AddToDeckModal.module.css';

interface Props {
	card: ScryfallCard;
	/**
	 * When set, the card is added by ASSIGNING existing owned rows (rowIds of the
	 * card stack) to the deck — no new copy is created. Quantity is capped to the
	 * number of rowIds and the quantity field is hidden when there is only one.
	 * When omitted (e.g. from search), new deck copies are created instead.
	 */
	ownedRowIds?: string[];
	onClose: () => void;
}

export function AddToDeckModal({ card, ownedRowIds, onClose }: Props) {
	const { decks, addCardToDeck, addCollectionCardToDeck } = useDeckContext();

	const sortedDecks = useMemo(
		() => [...decks].sort((a, b) => a.name.localeCompare(b.name)),
		[decks]
	);

	const [deckId, setDeckId] = useState<string>(sortedDecks[0]?.id ?? '');
	const selectedDeck = sortedDecks.find((d) => d.id === deckId) ?? null;
	const zones = useMemo(() => zonesForFormat(selectedDeck?.format), [selectedDeck?.format]);

	const [zone, setZone] = useState<DeckZone>('mainboard');
	const [quantity, setQuantity] = useState(1);

	// Keep the selected zone valid when the deck (and thus available zones) changes.
	const effectiveZone = zones.includes(zone) ? zone : zones[0];

	const assigning = ownedRowIds != null;
	const maxQuantity = ownedRowIds?.length ?? Infinity;
	const showQuantity = assigning ? maxQuantity > 1 : true;

	function handleConfirm() {
		if (!deckId) return;
		if (assigning) {
			// Assign existing rows to the deck (sets deck_id on the same rowId — no
			// new copy). Cap to the available stack size.
			const count = Math.min(quantity, ownedRowIds.length);
			for (const rowId of ownedRowIds.slice(0, count)) {
				addCollectionCardToDeck(deckId, rowId, effectiveZone);
			}
		} else {
			// addCardToDeck guards on activeDeckId, so it is safe to target a deck
			// that is not currently open (unlike bulkAddCardsToDeck, which forces the
			// active deck). One insert per copy.
			for (let i = 0; i < quantity; i++) {
				addCardToDeck(deckId, card, effectiveZone);
			}
		}
		onClose();
	}

	const title = `Ajouter à un deck — ${card.name}`;

	return (
		<Modal onClose={onClose} className={styles.modal} zIndex={1100}>
			<div className={styles.header}>
				<span className={styles.title}>{title}</span>
				<button type="button" className={styles.closeIcon} onClick={onClose} aria-label="Close">
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path
							d="M2 2l12 12M14 2L2 14"
							stroke="currentColor"
							strokeWidth="1.8"
							strokeLinecap="round"
						/>
					</svg>
				</button>
			</div>

			<div className={styles.body}>
				<div className={styles.preview}>
					<CardImage card={card} size="normal" />
				</div>

				<div className={styles.form}>
					{sortedDecks.length === 0 ? (
						<div className={styles.empty}>
							<p>Vous n&apos;avez aucun deck.</p>
							<Link href="/decks" className={styles.createLink} onClick={onClose}>
								Créer un deck
							</Link>
						</div>
					) : (
						<>
							<div className={styles.field}>
								<label className={styles.label} htmlFor="add-deck-deck">
									Deck
								</label>
								<select
									id="add-deck-deck"
									className={styles.select}
									value={deckId}
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
								<label className={styles.label} htmlFor="add-deck-zone">
									Zone
								</label>
								<select
									id="add-deck-zone"
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

							{showQuantity && (
								<div className={styles.field}>
									<label className={styles.label} htmlFor="add-deck-quantity">
										Quantité
									</label>
									<input
										id="add-deck-quantity"
										type="number"
										min={1}
										max={assigning ? maxQuantity : undefined}
										step={1}
										className={styles.select}
										value={quantity}
										onChange={(e) => {
											const n = parseInt(e.target.value, 10);
											const clamped = Number.isNaN(n) ? 1 : Math.max(1, n);
											setQuantity(assigning ? Math.min(maxQuantity, clamped) : clamped);
										}}
									/>
								</div>
							)}

							<button type="button" className={styles.confirmBtn} onClick={handleConfirm}>
								Ajouter
							</button>
						</>
					)}
				</div>
			</div>
		</Modal>
	);
}
