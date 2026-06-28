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
	 * When set, the card is added by assigning an existing owned collection copy
	 * to the deck (one copy, quantity is forced to 1 and hidden).
	 */
	collectionRowId?: string;
	onClose: () => void;
}

export function AddToDeckModal({ card, collectionRowId, onClose }: Props) {
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

	const usingCollectionCopy = collectionRowId != null;

	function handleConfirm() {
		if (!deckId) return;
		if (usingCollectionCopy) {
			addCollectionCardToDeck(deckId, collectionRowId, effectiveZone);
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

							{!usingCollectionCopy && (
								<div className={styles.field}>
									<label className={styles.label} htmlFor="add-deck-quantity">
										Quantité
									</label>
									<input
										id="add-deck-quantity"
										type="number"
										min={1}
										step={1}
										className={styles.select}
										value={quantity}
										onChange={(e) => {
											const n = parseInt(e.target.value, 10);
											setQuantity(Number.isNaN(n) ? 1 : Math.max(1, n));
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
