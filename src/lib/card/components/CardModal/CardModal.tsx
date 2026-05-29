'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import type { Card, CardEntry } from '@/types/cards';
import type { ScryfallCard, ScryfallCardSymbol } from '@/lib/scryfall/types/scryfall';
import type { DeckZone } from '@/types/decks';
import { getDeckZone } from '@/types/decks';
import { CardImage } from '@/lib/card/components/CardImage/CardImage';
import { CardLightbox } from '@/lib/card/components/CardLightbox/CardLightbox';
import { useScryfallSymbols } from '@/lib/scryfall/hooks/useScryfallSymbols';
import { SymbolText } from '@/lib/scryfall/components/SymbolText';
import { ColorIdentityIcons } from '@/lib/scryfall/components/ColorIdentityIcons';
import { EditCardModal } from '@/lib/card/components/EditCardModal/EditCardModal';
import type { CollectionCopyEntry } from '@/lib/card/components/CardPrintPickerModal/CardPrintPickerModal';
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal';
import { Modal } from '@/components/Modal/Modal';
import { Button } from '@/components/Button/Button';
import { CardList } from '@/lib/card/components/CardList/CardList';
import type { AnyCard, CardListSection } from '@/lib/card/components/CardList/CardList.types';
import type { CardListColumn } from '@/lib/card/components/CardListTable/CardListTable.types';
import { WishlistIcon } from '@/components/WishlistIcon/WishlistIcon';
import { CopyCardOverlay } from './CopyCardOverlay';
import styles from './CardModal.module.css';

const ZONE_LABELS: Record<DeckZone, string> = {
	mainboard: 'Mainboard',
	sideboard: 'Sideboard',
	maybeboard: 'Maybeboard',
	commander: 'Commander',
};

const ZONE_ABBR: Record<DeckZone, string> = {
	mainboard: 'Main',
	sideboard: 'Side',
	maybeboard: 'Maybe',
	commander: 'Cmd',
};

function isCollectionCard(card: Card | ScryfallCard): card is Card {
	return 'entry' in card;
}

interface Props {
	cards: Card | Card[] | ScryfallCard | null;
	initialRowId?: string;
	initialChangingPrintRowId?: string;
	onClose: () => void;
	onSave?: (rowId: string, updates: Partial<CardEntry>) => void;
	onRemove?: (scryfallId: string) => void;
	onRemoveEntry?: (rowId: string) => void;
	onDuplicate?: (scryfallId: string, entry: CardEntry) => void;
	onChangePrint?: (rowId: string, newCard: ScryfallCard) => void;
	onIncrement?: (entry: Partial<CardEntry>) => void;
	onDecrement?: () => void;
	onAddToCollection?: (card: ScryfallCard, entry: Partial<CardEntry>) => void;
	addLabel?: string;
	zone?: DeckZone;
	availableZones?: DeckZone[];
	onChangeZone?: (rowId: string, zone: DeckZone) => void;
	collectionCopies?: CollectionCopyEntry[];
	onAssignCollectionCopy?: (rowId: string) => void;
	onMoveToCollection?: (rowId: string) => void;
	onAddToWishlistFromEntry?: (scryfallId: string) => void;
	onAddToWishlist?: (card: ScryfallCard, entry: Partial<CardEntry>) => void;
}

interface InnerProps {
	cards: Card[];
	initialRowId?: string;
	initialChangingPrintRowId?: string;
	onClose: () => void;
	onSave?: (rowId: string, updates: Partial<CardEntry>) => void;
	onRemove?: (scryfallId: string) => void;
	onRemoveEntry?: (rowId: string) => void;
	onDuplicate?: (scryfallId: string, entry: CardEntry) => void;
	onChangePrint?: (rowId: string, newCard: ScryfallCard) => void;
	onIncrement?: (entry: Partial<CardEntry>) => void;
	onDecrement?: () => void;
	zone?: DeckZone;
	availableZones?: DeckZone[];
	onChangeZone?: (rowId: string, zone: DeckZone) => void;
	collectionCopies?: CollectionCopyEntry[];
	onAssignCollectionCopy?: (rowId: string) => void;
	onMoveToCollection?: (rowId: string) => void;
	onAddToWishlistFromEntry?: (scryfallId: string) => void;
}

function CardDetailSection({
	card,
	symbolMap,
}: {
	card: ScryfallCard;
	symbolMap: Record<string, ScryfallCardSymbol>;
}) {
	return (
		<>
			<div className={styles.cardMeta}>
				<div className={styles.cardNameRow}>
					<h2 className={styles.cardName}>{card.name}</h2>
					{card.mana_cost && (
						<span className={styles.headerMana}>
							<SymbolText text={card.mana_cost} symbolMap={symbolMap} />
						</span>
					)}
				</div>
				{card.color_identity && card.color_identity.length > 0 && (
					<div className={styles.colorPips}>
						<ColorIdentityIcons colors={card.color_identity} size={18} />
					</div>
				)}
			</div>

			<hr className={styles.divider} />

			<div className={styles.details}>
				{card.type_line && (
					<div className={styles.detailRow}>
						<span className={styles.detailLabel}>Type</span>
						<span className={styles.detailValue}>{card.type_line}</span>
					</div>
				)}
				<div className={styles.detailRow}>
					<span className={styles.detailLabel}>Set</span>
					<span className={styles.detailValue}>
						{card.set_name}
						{card.rarity && (
							<span className={`${styles.rarity} ${styles[card.rarity]}`}> · {card.rarity}</span>
						)}
					</span>
				</div>
				{card.oracle_text && (
					<div>
						<span className={styles.detailLabel}>Oracle</span>
						<div className={styles.oracleText}>
							{card.oracle_text.split('\n').map((line, i) => (
								<p key={i} className={styles.oracleLine}>
									<SymbolText text={line} symbolMap={symbolMap} />
								</p>
							))}
						</div>
					</div>
				)}
				{card.flavor_text && <p className={styles.flavorText}>{card.flavor_text}</p>}
				{card.loyalty && (
					<div className={styles.detailRow}>
						<span className={styles.detailLabel}>Loyalty</span>
						<span className={styles.detailValue}>{card.loyalty}</span>
					</div>
				)}
				{card.keywords && card.keywords.length > 0 && (
					<div className={styles.keywords}>
						{card.keywords.map((k) => (
							<span key={k} className={styles.keyword}>
								{k}
							</span>
						))}
					</div>
				)}
				<div className={styles.detailRow}>
					<span className={styles.detailLabel}>Artist</span>
					<span className={styles.detailValue}>{card.artist ?? '—'}</span>
				</div>
				<div className={styles.detailRow}>
					<span className={styles.detailLabel}>Print</span>
					<span className={styles.detailValue}>
						{card.set.toUpperCase()} #{card.collector_number}
					</span>
				</div>
			</div>

			<Link href={`/card/${card.id}`} className={styles.moreInfoLink}>
				Plus d&apos;informations
			</Link>
		</>
	);
}

function CardModalInner({
	cards,
	initialRowId,
	initialChangingPrintRowId,
	onClose,
	onSave,
	onRemove,
	onRemoveEntry,
	onDuplicate,
	onChangePrint,
	onIncrement,
	zone,
	availableZones,
	onChangeZone,
	collectionCopies,
	onAssignCollectionCopy,
	onMoveToCollection,
	onAddToWishlistFromEntry,
}: InnerProps) {
	const [lightbox, setLightbox] = useState(false);
	const [selectedRowId, setSelectedRowId] = useState<string>(initialRowId ?? cards[0].entry.rowId);
	const [editingRowId, setEditingRowId] = useState<string | null>(null);
	const [changingPrintRowId, setChangingPrintRowId] = useState<string | null>(
		initialChangingPrintRowId ?? null
	);
	const [addingCopy, setAddingCopy] = useState(false);
	const [confirmRemoveAll, setConfirmRemoveAll] = useState(false);
	const symbolMap = useScryfallSymbols();

	const count = cards.length;

	const selectedCard: Card = cards.find((c) => c.entry.rowId === selectedRowId) ?? cards[0];

	const editingCard = editingRowId
		? (cards.find((c) => c.entry.rowId === editingRowId) ?? null)
		: null;

	const handleRemoveCopy = useCallback(
		(card: Card) => {
			if (count === 1) {
				onRemove?.(card.id);
			} else {
				if (card.entry.rowId === selectedRowId) {
					const idx = cards.indexOf(card);
					const next = cards[idx === 0 ? 1 : idx - 1];
					setSelectedRowId(next.entry.rowId);
				}
				onRemoveEntry?.(card.entry.rowId);
			}
		},
		[count, selectedRowId, cards, onRemove, onRemoveEntry]
	);

	const copySections: CardListSection[] | Card[] = useMemo(() => {
		if (!availableZones) return cards;
		const byZone = new Map<DeckZone, Card[]>();
		for (const card of cards) {
			const z = getDeckZone(card.entry.tags);
			const existing = byZone.get(z) ?? [];
			existing.push(card);
			byZone.set(z, existing);
		}
		return availableZones
			.filter((z) => byZone.has(z))
			.map((z) => ({
				label: `${ZONE_LABELS[z]} (${byZone.get(z)!.length})`,
				cards: byZone.get(z)!,
			}));
	}, [cards, availableZones]);

	const tableColumns: CardListColumn[] = useMemo(
		() => [
			{
				key: 'print',
				label: 'Print',
				render: (c) => {
					const card = c as Card;
					return `${card.set.toUpperCase()} #${card.collector_number}`;
				},
			},
			{
				key: 'condition',
				label: 'Condition',
				render: (c) => (c as Card).entry.condition ?? '—',
			},
			{
				key: 'foil',
				label: 'Foil',
				render: (c) => ((c as Card).entry.isFoil ? '✦' : '—'),
			},
			{
				key: 'language',
				label: 'Langue',
				render: (c) => (c as Card).entry.language ?? 'English',
			},
			{
				key: 'actions',
				label: '',
				render: (c) => {
					const card = c as Card;
					return (
						<span className={styles.tableActions}>
							<button
								type="button"
								className={styles.tableActionBtn}
								onClick={(e) => {
									e.stopPropagation();
									setEditingRowId(card.entry.rowId);
								}}
							>
								Edit
							</button>
							{onDuplicate && (
								<button
									type="button"
									className={styles.tableActionBtn}
									title="Duplicate"
									onClick={(e) => {
										e.stopPropagation();
										onDuplicate(card.id, card.entry);
									}}
								>
									⧉
								</button>
							)}
							{onChangeZone &&
								availableZones
									?.filter((z) => z !== getDeckZone(card.entry.tags))
									.map((z) => (
										<button
											key={z}
											type="button"
											className={styles.tableActionBtn}
											title={`Move to ${ZONE_LABELS[z]}`}
											onClick={(e) => {
												e.stopPropagation();
												onChangeZone(card.entry.rowId, z);
											}}
										>
											{ZONE_ABBR[z]}
										</button>
									))}
							<button
								type="button"
								className={styles.tableActionBtnDanger}
								onClick={(e) => {
									e.stopPropagation();
									handleRemoveCopy(card);
								}}
							>
								×
							</button>
						</span>
					);
				},
			},
		],
		[onDuplicate, onChangeZone, availableZones, handleRemoveCopy]
	);

	const renderCopyOverlay = useCallback(
		(c: AnyCard) => {
			const card = c as Card;
			const cardZone = availableZones ? getDeckZone(card.entry.tags) : zone;
			return (
				<CopyCardOverlay
					card={card}
					isSelected={card.entry.rowId === selectedRowId}
					onSelect={() => setSelectedRowId(card.entry.rowId)}
					onEdit={() => setEditingRowId(card.entry.rowId)}
					onRemove={() => handleRemoveCopy(card)}
					onDuplicate={onDuplicate ? () => onDuplicate(card.id, card.entry) : undefined}
					zone={cardZone}
					availableZones={availableZones}
					onChangeZone={onChangeZone ? (z) => onChangeZone(card.entry.rowId, z) : undefined}
				/>
			);
		},
		[selectedRowId, handleRemoveCopy, onDuplicate, zone, availableZones, onChangeZone]
	);

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
							isFoil={selectedCard.entry.isFoil}
							foilType={selectedCard.entry.foilType}
							isProxy={selectedCard.entry.proxy}
						/>
						{onChangePrint && (
							<button
								type="button"
								className={styles.changePrintBtn}
								onClick={() => setChangingPrintRowId(selectedCard.entry.rowId)}
							>
								Changer de print
							</button>
						)}
					</div>

					<div className={styles.infoCol}>
						<CardDetailSection card={selectedCard} symbolMap={symbolMap} />

						{/* Copies list */}
						<div className={styles.copiesSection}>
							<div className={styles.copiesHeader}>
								<span className={styles.copiesTitle}>Copies ({count})</span>
								<button
									type="button"
									onClick={() => setAddingCopy(true)}
									className={styles.addCopyBtn}
									aria-label="Add copy"
								>
									+
								</button>
							</div>
							<CardList
								cards={copySections}
								pageSize={false}
								onCardClick={(c) => setSelectedRowId((c as Card).entry.rowId)}
								renderOverlay={renderCopyOverlay}
								tableColumns={tableColumns}
								cardsPerLine={3}
								fluidSections
							/>
							{onRemove && (
								<button
									type="button"
									className={styles.removeAllBtn}
									onClick={() => setConfirmRemoveAll(true)}
								>
									Remove all
								</button>
							)}
						</div>

						{(onMoveToCollection || onAddToWishlistFromEntry) && (
							<div className={styles.addSection}>
								{onMoveToCollection && (
									<Button
										variant="primary"
										onClick={() => onMoveToCollection(selectedCard.entry.rowId)}
									>
										Move to Collection
									</Button>
								)}
								{onAddToWishlistFromEntry && (
									<Button
										variant="secondary"
										onClick={() => onAddToWishlistFromEntry(selectedCard.id)}
									>
										<WishlistIcon size={13} /> Add to Wishlist
									</Button>
								)}
							</div>
						)}
					</div>
				</div>
			</Modal>

			{lightbox && (
				<CardLightbox
					card={selectedCard}
					onClose={() => setLightbox(false)}
					isFoil={selectedCard.entry.isFoil}
					foilType={selectedCard.entry.foilType}
				/>
			)}

			{confirmRemoveAll && (
				<ConfirmModal
					message={
						<>
							Remove all {cards.length} cop{cards.length === 1 ? 'y' : 'ies'} of{' '}
							<strong>{selectedCard.name}</strong>?
						</>
					}
					confirmLabel="Remove all"
					onConfirm={() => {
						const uniqueIds = [...new Set(cards.map((c) => c.id))];
						uniqueIds.forEach((id) => onRemove?.(id));
					}}
					onClose={() => setConfirmRemoveAll(false)}
				/>
			)}

			{editingCard && (
				<EditCardModal
					key={editingCard.entry.rowId}
					card={editingCard}
					onSave={(patch) => onSave?.(editingCard.entry.rowId, patch)}
					onChangePrint={(newCard) => {
						onChangePrint?.(editingCard.entry.rowId, newCard);
					}}
					onClose={() => setEditingRowId(null)}
					collectionCopies={collectionCopies}
					onSelectCollectionCopy={onAssignCollectionCopy}
				/>
			)}

			{changingPrintRowId &&
				(() => {
					const card = cards.find((c) => c.entry.rowId === changingPrintRowId);
					return card ? (
						<EditCardModal
							key={`print-${changingPrintRowId}`}
							card={card}
							onSave={(patch) => onSave?.(changingPrintRowId, patch)}
							onChangePrint={(newCard) => {
								onChangePrint?.(changingPrintRowId, newCard);
								setChangingPrintRowId(null);
							}}
							onClose={() => setChangingPrintRowId(null)}
							collectionCopies={collectionCopies}
							onSelectCollectionCopy={(rowId) => {
								onAssignCollectionCopy?.(rowId);
								setChangingPrintRowId(null);
							}}
							autoOpenPrintPicker
						/>
					) : null;
				})()}

			{addingCopy && (
				<EditCardModal
					mode="add"
					scryfallCard={selectedCard}
					onAdd={(_print, entry) => {
						onIncrement?.(entry);
						setAddingCopy(false);
					}}
					onClose={() => setAddingCopy(false)}
				/>
			)}
		</>
	);
}

function ScryfallCardModalInner({
	card,
	onClose,
	onAddToCollection,
	addLabel = 'Add to Collection',
	availableZones,
	onAddToWishlist,
}: {
	card: ScryfallCard;
	onClose: () => void;
	onAddToCollection?: (card: ScryfallCard, entry: Partial<CardEntry>) => void;
	addLabel?: string;
	availableZones?: DeckZone[];
	onAddToWishlist?: (card: ScryfallCard, entry: Partial<CardEntry>) => void;
}) {
	const [lightbox, setLightbox] = useState(false);
	const [addingCard, setAddingCard] = useState(false);
	const [addingToWishlist, setAddingToWishlist] = useState(false);
	const symbolMap = useScryfallSymbols();

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
						<CardImage card={card} size="large" priority onClick={() => setLightbox(true)} />
					</div>

					<div className={styles.infoCol}>
						<CardDetailSection card={card} symbolMap={symbolMap} />

						{(onAddToCollection || onAddToWishlist) && (
							<div className={styles.addSection}>
								{onAddToCollection && (
									<Button variant="primary" onClick={() => setAddingCard(true)}>
										{addLabel}
									</Button>
								)}
								{onAddToWishlist && (
									<Button variant="secondary" onClick={() => setAddingToWishlist(true)}>
										<WishlistIcon size={13} /> Add to Wishlist
									</Button>
								)}
							</div>
						)}
					</div>
				</div>
			</Modal>

			{lightbox && <CardLightbox card={card} onClose={() => setLightbox(false)} />}

			{addingCard && onAddToCollection && (
				<EditCardModal
					mode="add"
					scryfallCard={card}
					availableZones={availableZones}
					onAdd={(selectedPrint, entry) => {
						onAddToCollection(selectedPrint, entry);
						setAddingCard(false);
					}}
					onClose={() => setAddingCard(false)}
				/>
			)}

			{addingToWishlist && onAddToWishlist && (
				<EditCardModal
					mode="add"
					scryfallCard={card}
					onAdd={(selectedPrint, entry) => {
						onAddToWishlist(selectedPrint, entry);
						setAddingToWishlist(false);
					}}
					onClose={() => setAddingToWishlist(false)}
				/>
			)}
		</>
	);
}

export function CardModal({
	cards,
	initialRowId,
	initialChangingPrintRowId,
	onClose,
	onSave,
	onRemove,
	onRemoveEntry,
	onDuplicate,
	onChangePrint,
	onIncrement,
	onDecrement,
	onAddToCollection,
	addLabel,
	zone,
	availableZones,
	onChangeZone,
	collectionCopies,
	onAssignCollectionCopy,
	onMoveToCollection,
	onAddToWishlistFromEntry,
	onAddToWishlist,
}: Props) {
	if (cards === null) return null;

	const normalizedCards = Array.isArray(cards) ? cards : [cards];
	if (normalizedCards.length === 0) return null;

	const first = normalizedCards[0];

	if (!isCollectionCard(first)) {
		return (
			<ScryfallCardModalInner
				key={first.id}
				card={first}
				onClose={onClose}
				onAddToCollection={onAddToCollection}
				addLabel={addLabel}
				availableZones={availableZones}
				onAddToWishlist={onAddToWishlist}
			/>
		);
	}

	return (
		<CardModalInner
			key={first.oracle_id}
			cards={normalizedCards as Card[]}
			initialRowId={initialRowId}
			initialChangingPrintRowId={initialChangingPrintRowId}
			onClose={onClose}
			onSave={onSave}
			onRemove={onRemove}
			onRemoveEntry={onRemoveEntry}
			onDuplicate={onDuplicate}
			onChangePrint={onChangePrint}
			onIncrement={onIncrement}
			onDecrement={onDecrement}
			zone={zone}
			availableZones={availableZones}
			onChangeZone={onChangeZone}
			collectionCopies={collectionCopies}
			onAssignCollectionCopy={onAssignCollectionCopy}
			onMoveToCollection={onMoveToCollection}
			onAddToWishlistFromEntry={onAddToWishlistFromEntry}
		/>
	);
}
