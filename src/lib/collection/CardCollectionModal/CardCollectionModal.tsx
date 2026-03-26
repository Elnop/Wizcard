'use client';

import { useState } from 'react';
import type { Card, CardStack, CardEntry } from '@/types/cards';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { CardImage } from '@/components/cards/CardImage';
import { useScryfallSymbols } from '@/lib/scryfall/hooks/useScryfallSymbols';
import { SymbolText } from '@/components/ui/SymbolText';
import { CopyEditModal } from './components/CopyEditModal/CopyEditModal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Modal } from '@/components/ui/Modal';
import styles from './CardCollectionModal.module.css';
import lightboxStyles from '../styles/lightbox.module.css';

const COLOR_MAP: Record<string, string> = {
	W: '#f8e7b9',
	U: '#0e68ab',
	B: '#a0a0a0',
	R: '#d3202a',
	G: '#00733e',
	C: '#ccc2c0',
};

interface Props {
	stack: CardStack | null;
	onClose: () => void;
	onSave: (rowId: string, updates: Partial<CardEntry>) => void;
	onRemove: (scryfallId: string) => void;
	onRemoveEntry: (rowId: string) => void;
	onDuplicate?: (scryfallId: string, entry: CardEntry) => void;
	onChangePrint?: (rowId: string, newCard: ScryfallCard) => void;
	onIncrement?: () => void;
	onDecrement?: () => void;
}

interface InnerProps {
	stack: CardStack;
	onClose: () => void;
	onSave: (rowId: string, updates: Partial<CardEntry>) => void;
	onRemove: (scryfallId: string) => void;
	onRemoveEntry: (rowId: string) => void;
	onDuplicate?: (scryfallId: string, entry: CardEntry) => void;
	onChangePrint?: (rowId: string, newCard: ScryfallCard) => void;
	onIncrement?: () => void;
	onDecrement?: () => void;
}

function CardCollectionModalInner({
	stack,
	onClose,
	onSave,
	onRemove,
	onRemoveEntry,
	onDuplicate,
	onChangePrint,
	onIncrement,
}: InnerProps) {
	const [lightbox, setLightbox] = useState(false);
	const [selectedRowId, setSelectedRowId] = useState<string>(stack.cards[0].entry.rowId);
	const [editingRowId, setEditingRowId] = useState<string | null>(null);
	const [confirmRemoveAll, setConfirmRemoveAll] = useState(false);
	const symbolMap = useScryfallSymbols();

	const count = stack.cards.length;

	// Keep selectedRowId valid if stack updates
	const selectedCard: Card =
		stack.cards.find((c) => c.entry.rowId === selectedRowId) ?? stack.cards[0];

	const editingCard = editingRowId
		? (stack.cards.find((c) => c.entry.rowId === editingRowId) ?? null)
		: null;

	function handleRemoveCopy(card: Card) {
		if (count === 1) {
			onRemove(card.id);
		} else {
			if (card.entry.rowId === selectedRowId) {
				const idx = stack.cards.indexOf(card);
				const next = stack.cards[idx === 0 ? 1 : idx - 1];
				setSelectedRowId(next.entry.rowId);
			}
			onRemoveEntry(card.entry.rowId);
		}
	}

	return (
		<>
			<Modal onClose={onClose} className={styles.modal}>
				<button className={styles.closeIcon} onClick={onClose} aria-label="Close" type="button">
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path
							d="M2 2l12 12M14 2L2 14"
							stroke="currentColor"
							strokeWidth="1.8"
							strokeLinecap="round"
						/>
					</svg>
				</button>

				<div className={styles.layout}>
					<div className={styles.imageCol}>
						<CardImage
							card={selectedCard}
							size="large"
							priority
							onClick={() => setLightbox(true)}
						/>
					</div>

					<div className={styles.infoCol}>
						<div className={styles.cardMeta}>
							<div className={styles.cardNameRow}>
								<h2 className={styles.cardName}>{selectedCard.name}</h2>
								{selectedCard.mana_cost && (
									<span className={styles.headerMana}>
										<SymbolText text={selectedCard.mana_cost} symbolMap={symbolMap} />
									</span>
								)}
							</div>
							{selectedCard.color_identity && selectedCard.color_identity.length > 0 && (
								<div className={styles.colorPips}>
									{selectedCard.color_identity.map((c) => (
										<span
											key={c}
											className={styles.colorPip}
											style={{ background: COLOR_MAP[c] ?? '#888' }}
											title={c}
										/>
									))}
								</div>
							)}
						</div>

						<hr className={styles.divider} />

						<div className={styles.details}>
							{selectedCard.type_line && (
								<div className={styles.detailRow}>
									<span className={styles.detailLabel}>Type</span>
									<span className={styles.detailValue}>{selectedCard.type_line}</span>
								</div>
							)}
							<div className={styles.detailRow}>
								<span className={styles.detailLabel}>Set</span>
								<span className={styles.detailValue}>
									{selectedCard.set_name}
									{selectedCard.rarity && (
										<span className={`${styles.rarity} ${styles[selectedCard.rarity]}`}>
											{' '}
											· {selectedCard.rarity}
										</span>
									)}
								</span>
							</div>
							{selectedCard.oracle_text && (
								<div>
									<span className={styles.detailLabel}>Oracle</span>
									<div className={styles.oracleText}>
										{selectedCard.oracle_text.split('\n').map((line, i) => (
											<p key={i} className={styles.oracleLine}>
												<SymbolText text={line} symbolMap={symbolMap} />
											</p>
										))}
									</div>
								</div>
							)}
							{selectedCard.flavor_text && (
								<p className={styles.flavorText}>{selectedCard.flavor_text}</p>
							)}
							{selectedCard.loyalty && (
								<div className={styles.detailRow}>
									<span className={styles.detailLabel}>Loyalty</span>
									<span className={styles.detailValue}>{selectedCard.loyalty}</span>
								</div>
							)}
							{selectedCard.keywords && selectedCard.keywords.length > 0 && (
								<div className={styles.keywords}>
									{selectedCard.keywords.map((k) => (
										<span key={k} className={styles.keyword}>
											{k}
										</span>
									))}
								</div>
							)}
							<div className={styles.detailRow}>
								<span className={styles.detailLabel}>Artist</span>
								<span className={styles.detailValue}>{selectedCard.artist ?? '—'}</span>
							</div>
							<div className={styles.detailRow}>
								<span className={styles.detailLabel}>Print</span>
								<span className={styles.detailValue}>
									{selectedCard.set.toUpperCase()} #{selectedCard.collector_number}
								</span>
							</div>
						</div>

						{/* Copies list */}
						<div className={styles.copiesSection}>
							<div className={styles.copiesHeader}>
								<span className={styles.copiesTitle}>Copies ({count})</span>
								<button
									type="button"
									onClick={() => onIncrement?.()}
									className={styles.addCopyBtn}
									aria-label="Add copy"
								>
									+
								</button>
							</div>
							<ul className={styles.copiesList}>
								{stack.cards.map((card) => {
									const isActive = card.entry.rowId === selectedRowId;
									return (
										<li
											key={card.entry.rowId}
											className={`${styles.copyRow} ${isActive ? styles.copyRowActive : ''}`}
											onClick={() => setSelectedRowId(card.entry.rowId)}
										>
											<span className={styles.copyInfo}>
												<span className={styles.copyBadge}>
													{card.set.toUpperCase()} #{card.collector_number}
												</span>
												{card.entry.condition && (
													<span className={styles.copyBadge}>{card.entry.condition}</span>
												)}
												{card.entry.isFoil && <span className={styles.copyBadgeFoil}>✦</span>}
												{card.entry.language && card.entry.language !== 'English' && (
													<span className={styles.copyBadge}>{card.entry.language}</span>
												)}
											</span>
											<span className={styles.copyActions}>
												<button
													type="button"
													className={styles.copyEditBtn}
													onClick={(e) => {
														e.stopPropagation();
														setEditingRowId(card.entry.rowId);
													}}
													aria-label="Edit this copy"
												>
													Edit
												</button>
												<button
													type="button"
													className={styles.copyEditBtn}
													onClick={(e) => {
														e.stopPropagation();
														onDuplicate?.(card.id, card.entry);
													}}
													aria-label="Duplicate this copy"
													title="Duplicate"
												>
													⧉
												</button>
												<button
													type="button"
													className={styles.copyRemoveBtn}
													onClick={(e) => {
														e.stopPropagation();
														handleRemoveCopy(card);
													}}
													aria-label="Remove this copy"
												>
													×
												</button>
											</span>
										</li>
									);
								})}
							</ul>
							<button
								type="button"
								className={styles.removeAllBtn}
								onClick={() => setConfirmRemoveAll(true)}
							>
								Remove all
							</button>
						</div>
					</div>
				</div>
			</Modal>

			{lightbox && (
				<div className={lightboxStyles.lightbox} onClick={() => setLightbox(false)}>
					<div className={lightboxStyles.lightboxCard} onClick={(e) => e.stopPropagation()}>
						<CardImage card={selectedCard} size="large" priority />
					</div>
				</div>
			)}

			{confirmRemoveAll && (
				<ConfirmModal
					message={
						<>
							Remove all {stack.cards.length} cop{stack.cards.length === 1 ? 'y' : 'ies'} of{' '}
							<strong>{stack.name}</strong>?
						</>
					}
					confirmLabel="Remove all"
					onConfirm={() => {
						const uniqueIds = [...new Set(stack.cards.map((c) => c.id))];
						uniqueIds.forEach((id) => onRemove(id));
					}}
					onClose={() => setConfirmRemoveAll(false)}
				/>
			)}

			{editingCard && (
				<CopyEditModal
					card={editingCard}
					onSave={(patch) => onSave(editingCard.entry.rowId, patch)}
					onChangePrint={(newCard) => {
						onChangePrint?.(editingCard.entry.rowId, newCard);
					}}
					onClose={() => setEditingRowId(null)}
				/>
			)}
		</>
	);
}

export function CardCollectionModal({
	stack,
	onClose,
	onSave,
	onRemove,
	onRemoveEntry,
	onDuplicate,
	onChangePrint,
	onIncrement,
	onDecrement,
}: Props) {
	if (!stack || stack.cards.length === 0) return null;
	return (
		<CardCollectionModalInner
			key={stack.oracleId}
			stack={stack}
			onClose={onClose}
			onSave={onSave}
			onRemove={onRemove}
			onRemoveEntry={onRemoveEntry}
			onDuplicate={onDuplicate}
			onChangePrint={onChangePrint}
			onIncrement={onIncrement}
			onDecrement={onDecrement}
		/>
	);
}
