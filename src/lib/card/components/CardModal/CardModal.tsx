'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import type { Card, CardEntry } from '@/types/cards';
import type { ScryfallCard, ScryfallCardSymbol } from '@/lib/scryfall/types/scryfall';
import type { CustomCard } from '@/lib/mpc/types';
import { isCustomCard } from '@/lib/mpc/types';
import type { DeckZone } from '@/types/decks';
import { getDeckZone, removeDeckZoneTags } from '@/types/decks';
import { CardImage } from '@/lib/card/components/CardImage/CardImage';
import { CardLightbox } from '@/lib/card/components/CardLightbox/CardLightbox';
import { useScryfallSymbols } from '@/lib/scryfall/hooks/useScryfallSymbols';
import { SymbolText } from '@/lib/scryfall/components/SymbolText';
import { ColorIdentityIcons } from '@/lib/scryfall/components/ColorIdentityIcons';
import { EditCardModal } from '@/lib/card/components/EditCardModal/EditCardModal';
import { UseCollectionCopyModal } from '@/lib/card/components/UseCollectionCopyModal/UseCollectionCopyModal';
import type { CollectionCopyEntry } from '@/lib/card/components/CardPrintPickerModal/CardPrintPickerModal';
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal';
import { Modal } from '@/components/Modal/Modal';
import { Button } from '@/components/Button/Button';
import { CardList } from '@/lib/card/components/CardList/CardList';
import type { AnyCard, CardListSection } from '@/lib/card/components/CardList/CardList.types';
import type { CardListColumn } from '@/lib/card/components/CardListTable/CardListTable.types';
import { WishlistIcon } from '@/components/WishlistIcon';
import { CardTokensSection } from '@/lib/card/components/CardTokensSection/CardTokensSection';
import { useCardTokens } from '@/lib/card/hooks/useCardTokens';
import { CopyCardOverlay } from './CopyCardOverlay';
import { CustomCardSection } from './CustomCardSection';
import styles from './CardModal.module.css';

const ZONE_LABELS: Record<DeckZone, string> = {
	mainboard: 'Mainboard',
	sideboard: 'Sideboard',
	maybeboard: 'Maybeboard',
	commander: 'Commander',
	tokens: 'Tokens',
};

const ZONE_ABBR: Record<DeckZone, string> = {
	mainboard: 'Main',
	sideboard: 'Side',
	maybeboard: 'Maybe',
	commander: 'Cmd',
	tokens: 'Tok',
};

function isCollectionCard(card: Card | ScryfallCard): card is Card {
	return 'entry' in card;
}

interface Props {
	cards: Card | Card[] | ScryfallCard | CustomCard | null;
	initialRowId?: string;
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
	onAddToCollectionFromEntry?: (rowIds: string[]) => void;
	onRemoveFromCollectionEntry?: (rowId: string) => void;
	onAddToWishlist?: (card: ScryfallCard, entry: Partial<CardEntry>) => void;
	producerSections?: CardListSection[];
	onProducerClick?: (card: AnyCard) => void;
}

interface InnerProps {
	cards: Card[];
	initialRowId?: string;
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
	onAddToCollectionFromEntry?: (rowIds: string[]) => void;
	onRemoveFromCollectionEntry?: (rowId: string) => void;
	producerSections?: CardListSection[];
	onProducerClick?: (card: AnyCard) => void;
}

function CopyMetaSection({ entry }: { entry: CardEntry }) {
	let finish = 'Normal';
	if (entry.isFoil) finish = entry.foilType === 'etched' ? '✨ Etched' : '✨ Foil';
	const userTags = removeDeckZoneTags(entry.tags);
	const addedDate = entry.dateAdded
		? new Date(entry.dateAdded).toLocaleDateString('fr-FR', {
				year: 'numeric',
				month: 'long',
				day: 'numeric',
			})
		: null;

	return (
		<>
			<hr className={styles.divider} />
			<div className={styles.details}>
				<span className={styles.tokensTitle}>Cette copie</span>
				<div className={styles.detailRow}>
					<span className={styles.detailLabel}>Finition</span>
					<span className={styles.copyBadges}>
						<span className={entry.isFoil ? styles.copyBadgeFoil : styles.detailValue}>
							{finish}
						</span>
						{entry.proxy && <span className={styles.copyBadge}>Proxy</span>}
						{entry.alter && <span className={styles.copyBadge}>Alter</span>}
						{entry.forTrade && <span className={styles.copyBadge}>Trade</span>}
					</span>
				</div>
				{entry.condition && (
					<div className={styles.detailRow}>
						<span className={styles.detailLabel}>État</span>
						<span className={styles.detailValue}>{entry.condition}</span>
					</div>
				)}
				{entry.language && (
					<div className={styles.detailRow}>
						<span className={styles.detailLabel}>Langue</span>
						<span className={styles.detailValue}>{entry.language}</span>
					</div>
				)}
				{entry.purchasePrice && (
					<div className={styles.detailRow}>
						<span className={styles.detailLabel}>Prix</span>
						<span className={styles.detailValue}>{entry.purchasePrice}</span>
					</div>
				)}
				{userTags.length > 0 && (
					<div className={styles.detailRow}>
						<span className={styles.detailLabel}>Tags</span>
						<span className={styles.keywords}>
							{userTags.map((t) => (
								<span key={t} className={styles.keyword}>
									{t}
								</span>
							))}
						</span>
					</div>
				)}
				{addedDate && (
					<div className={styles.detailRow}>
						<span className={styles.detailLabel}>Ajoutée</span>
						<span className={styles.detailValue}>{addedDate}</span>
					</div>
				)}
			</div>
		</>
	);
}

function CardDetailSection({
	card,
	symbolMap,
	language,
	isCustom,
	entry,
}: {
	card: ScryfallCard;
	symbolMap: Record<string, ScryfallCardSymbol>;
	language?: string;
	isCustom?: boolean;
	entry?: CardEntry;
}) {
	const { tokens, loading: tokensLoading, hasTokens } = useCardTokens(card);
	const [tokenModalCard, setTokenModalCard] = useState<ScryfallCard | null>(null);

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
				{card.set && (
					<div className={styles.detailRow}>
						<span className={styles.detailLabel}>Print</span>
						<span className={styles.detailValue}>
							{card.set.toUpperCase()} #{card.collector_number}
						</span>
					</div>
				)}
				{language && language !== 'English' && (
					<div className={styles.detailRow}>
						<span className={styles.detailLabel}>Langue</span>
						<span className={styles.detailValue}>{language}</span>
					</div>
				)}
			</div>

			{entry && <CopyMetaSection entry={entry} />}

			{hasTokens && (
				<div className={styles.tokensSection}>
					<span className={styles.tokensTitle}>Tokens</span>
					<CardTokensSection
						tokens={tokens}
						loading={tokensLoading}
						onTokenClick={setTokenModalCard}
					/>
				</div>
			)}

			{!isCustom && (
				<Link href={`/card/${card.id}`} className={styles.moreInfoLink}>
					Plus d&apos;informations
				</Link>
			)}

			{tokenModalCard && (
				<CardModal cards={tokenModalCard} onClose={() => setTokenModalCard(null)} />
			)}
		</>
	);
}

function CardModalInner({
	cards,
	initialRowId,
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
	onAddToCollectionFromEntry,
	onRemoveFromCollectionEntry,
	producerSections,
	onProducerClick,
}: InnerProps) {
	const [lightbox, setLightbox] = useState(false);
	const [selectedRowId, setSelectedRowId] = useState<string>(initialRowId ?? cards[0].entry.rowId);
	const [editingRowId, setEditingRowId] = useState<string | null>(null);
	const [usingCollectionCopy, setUsingCollectionCopy] = useState(false);
	const [addingCopy, setAddingCopy] = useState(false);
	const [copyContextMenuCard, setCopyContextMenuCard] = useState<Card | null>(null);
	const [copyContextMenuPos, setCopyContextMenuPos] = useState<{ x: number; y: number } | null>(
		null
	);
	const [confirmRemoveAll, setConfirmRemoveAll] = useState(false);
	const symbolMap = useScryfallSymbols();

	const count = cards.length;

	const selectedCard: Card = cards.find((c) => c.entry.rowId === selectedRowId) ?? cards[0];

	// Copies of this card in the selected card's zone that are not yet owned.
	// Used to offer an "Ajouter à la collection" action (sets ownerId via toggleOwned).
	const selectedZone = availableZones ? getDeckZone(selectedCard.entry.tags) : undefined;
	const unownedRowIds = useMemo(
		() =>
			cards
				.filter(
					(c) =>
						!c.entry.ownerId &&
						(selectedZone === undefined || getDeckZone(c.entry.tags) === selectedZone)
				)
				.map((c) => c.entry.rowId),
		[cards, selectedZone]
	);

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
					return `${card.set?.toUpperCase() ?? ''} #${card.collector_number ?? ''}`;
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
											// eslint-disable-next-line sonarjs/no-nested-functions -- JSX event handler
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
			const isContextCard = copyContextMenuCard?.entry.rowId === card.entry.rowId;
			return (
				<CopyCardOverlay
					card={card}
					isSelected={card.entry.rowId === selectedRowId}
					onEdit={() => setEditingRowId(card.entry.rowId)}
					onRemove={() => handleRemoveCopy(card)}
					onDuplicate={onDuplicate ? () => onDuplicate(card.id, card.entry) : undefined}
					zone={cardZone}
					availableZones={availableZones}
					onChangeZone={onChangeZone ? (z) => onChangeZone(card.entry.rowId, z) : undefined}
					contextMenuPos={isContextCard ? copyContextMenuPos : null}
					onContextMenuClose={() => setCopyContextMenuPos(null)}
				/>
			);
		},
		[
			selectedRowId,
			handleRemoveCopy,
			onDuplicate,
			zone,
			availableZones,
			onChangeZone,
			copyContextMenuCard,
			copyContextMenuPos,
		]
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
						<button
							type="button"
							className={styles.changePrintBtn}
							onClick={() => setEditingRowId(selectedCard.entry.rowId)}
						>
							Modifier
						</button>
						{onAssignCollectionCopy && (
							<button
								type="button"
								className={styles.changePrintBtn}
								disabled={(collectionCopies?.length ?? 0) === 0}
								onClick={() => setUsingCollectionCopy(true)}
							>
								Utiliser une carte de la collection
							</button>
						)}
						{(onAddToCollectionFromEntry || onRemoveFromCollectionEntry) && (
							<button
								type="button"
								className={styles.changePrintBtn}
								onClick={() =>
									selectedCard.entry.ownerId
										? onRemoveFromCollectionEntry?.(selectedCard.entry.rowId)
										: onAddToCollectionFromEntry?.([selectedCard.entry.rowId])
								}
							>
								{selectedCard.entry.ownerId
									? 'Retirer de la collection'
									: 'Ajouter à la collection'}
							</button>
						)}
					</div>

					<div className={styles.infoCol}>
						<CardDetailSection
							card={selectedCard as ScryfallCard}
							symbolMap={symbolMap}
							language={selectedCard.entry.language}
							entry={selectedCard.entry}
						/>

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
								onCardContextMenu={(c, e) => {
									e.preventDefault();
									const card = c as Card;
									const MENU_WIDTH = 180;
									const MENU_HEIGHT = 200;
									const x =
										e.clientX + MENU_WIDTH > window.innerWidth ? e.clientX - MENU_WIDTH : e.clientX;
									const y =
										e.clientY + MENU_HEIGHT > window.innerHeight
											? e.clientY - MENU_HEIGHT
											: e.clientY;
									setCopyContextMenuCard(card);
									setCopyContextMenuPos({ x, y });
								}}
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

						{producerSections && producerSections.length > 0 && (
							<div className={styles.tokensSection}>
								<span className={styles.tokensTitle}>Cartes générant ce token</span>
								<CardList
									cards={producerSections}
									onCardClick={onProducerClick}
									pageSize={false}
									viewModes={['fluid-grid', 'grid', 'table']}
									cardGap="compact"
									showCardNames={false}
								/>
							</div>
						)}

						{(onMoveToCollection ||
							onAddToWishlistFromEntry ||
							(onAddToCollectionFromEntry && unownedRowIds.length > 0)) && (
							<div className={styles.addSection}>
								{onAddToCollectionFromEntry && unownedRowIds.length > 0 && (
									<Button
										variant="primary"
										onClick={() => onAddToCollectionFromEntry(unownedRowIds)}
									>
										Ajouter à la collection
									</Button>
								)}
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
					card={selectedCard as ScryfallCard}
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
				/>
			)}

			{usingCollectionCopy && (selectedCard as ScryfallCard).prints_search_uri && (
				<UseCollectionCopyModal
					prints_search_uri={(selectedCard as ScryfallCard).prints_search_uri}
					collectionCopies={collectionCopies ?? []}
					currentCollectionRowId={selectedCard.entry.rowId}
					onSelectCollectionCopy={(rowId) => {
						onAssignCollectionCopy?.(rowId);
						setUsingCollectionCopy(false);
					}}
					onClose={() => setUsingCollectionCopy(false)}
				/>
			)}

			{addingCopy && (
				<EditCardModal
					mode="add"
					scryfallCard={selectedCard as ScryfallCard}
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

function CustomCardModalInner({ card, onClose }: { card: CustomCard; onClose: () => void }) {
	const [lightbox, setLightbox] = useState(false);
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
						<CardDetailSection
							card={card as unknown as ScryfallCard}
							symbolMap={symbolMap}
							isCustom
						/>
						<Link href={`/card/${card.id}`} className={styles.moreInfoLink}>
							Plus d&apos;informations
						</Link>
						<CustomCardSection card={card} />
					</div>
				</div>
			</Modal>

			{lightbox && (
				<CardLightbox card={card as unknown as ScryfallCard} onClose={() => setLightbox(false)} />
			)}
		</>
	);
}

export function CardModal({
	cards,
	initialRowId,
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
	onAddToCollectionFromEntry,
	onRemoveFromCollectionEntry,
	onAddToWishlist,
	producerSections,
	onProducerClick,
}: Props) {
	if (cards === null) return null;

	const normalizedCards = Array.isArray(cards) ? cards : [cards];
	if (normalizedCards.length === 0) return null;

	const first = normalizedCards[0];

	// Custom card path — must come before isCollectionCard check
	if (isCustomCard(first as ScryfallCard | CustomCard)) {
		return <CustomCardModalInner key={first.id} card={first as CustomCard} onClose={onClose} />;
	}

	if (!isCollectionCard(first as Card | ScryfallCard)) {
		return (
			<ScryfallCardModalInner
				key={first.id}
				card={first as ScryfallCard}
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
			onAddToCollectionFromEntry={onAddToCollectionFromEntry}
			onRemoveFromCollectionEntry={onRemoveFromCollectionEntry}
			producerSections={producerSections}
			onProducerClick={onProducerClick}
		/>
	);
}
