'use client';

import { useMemo, useCallback, useState } from 'react';
import Link from 'next/link';
import type { CardStack, CardEntry } from '@/types/cards';
import { EditCardModal } from '@/lib/card/components/EditCardModal/EditCardModal';
import { AddToDeckModal } from '@/lib/card/components/AddToDeckModal/AddToDeckModal';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { useWishlistContext } from '@/lib/wishlist/context/WishlistContext';
import { WishlistIcon } from '@/lib/wishlist/components/WishlistIcon';
import { useCollectionCards } from '@/lib/collection/hooks/useCollectionCards';
import { ActiveCardProvider } from '@/app/collection/lib/CollectionCardModal/ActiveCardContext';
import { useCardModal } from '@/lib/card/hooks/useCardModal';
import { CardModal } from '@/lib/card/components/CardModal/CardModal';
import { CardList } from '@/lib/card/components/CardList/CardList';
import { DeckBadge } from '@/lib/card/components/DeckBadge/DeckBadge';
import { Button } from '@/components/Button/Button';
import { PdfSettingsModal } from '@/components/PdfSettingsModal/PdfSettingsModal';
import { generateCardsPdf } from '@/lib/pdf/generateCardsPdf';
import { resolveLocalizedImageUris } from '@/lib/scryfall/utils/resolveLocalizedImageUri';
import { withCustomBadge } from '@/lib/card/utils/composeOverlay';
import { useContextMenu } from '@/components/ContextMenu/useContextMenu';
import { ContextMenu } from '@/components/ContextMenu/ContextMenu';
import { buildWishlistMenuItems } from './wishlistCardMenu';
import styles from './page.module.css';

function buildInitialEntry(entry: CardEntry): Partial<CardEntry> {
	// Strip identity/ownership fields so the new collection copy is minted fresh.
	// Other metadata (forTrade, purchasePrice, alter, …) intentionally carries
	// over from the wishlist copy even though the modal does not expose it for
	// editing — a "for trade" wishlist card stays "for trade" once collected.
	const patch: Partial<CardEntry> = { ...entry };
	delete patch.rowId;
	delete patch.dateAdded;
	delete patch.deckId;
	delete patch.ownerId;
	delete patch.wishlist;
	return patch;
}

function WishlistPageInner() {
	const {
		entries,
		isLoaded,
		duplicateEntry,
		removeFromWishlist,
		clearWishlist,
		moveToCollection,
		changePrint,
	} = useWishlistContext();

	const { stacks, isLoading: isHydrating } = useCollectionCards(entries);

	const { resolvedStack, handleCardClick, handleCloseModal } = useCardModal(stacks);
	const cardMenu = useContextMenu<CardStack>();

	const [pdfSettingsModalOpen, setPdfSettingsModalOpen] = useState(false);
	const [pdfGenerating, setPdfGenerating] = useState(false);
	const [movingStack, setMovingStack] = useState<CardStack | null>(null);
	const [deckModal, setDeckModal] = useState<{ card: ScryfallCard; ownedRowIds: string[] } | null>(
		null
	);

	// One card per wishlist copy (e.g. 3x Sol Ring → 3 cards in the PDF).
	const pdfCards = useMemo(() => stacks.flatMap((stack) => stack.cards), [stacks]);

	const handleRemoveEntry = useCallback(
		(rowId: string) => {
			removeFromWishlist(rowId);
			handleCloseModal();
		},
		[removeFromWishlist, handleCloseModal]
	);

	const handleClearWishlist = useCallback(() => {
		if (confirm('Effacer toute la wishlist ? Cette action est irréversible.')) {
			clearWishlist();
		}
	}, [clearWishlist]);

	const handleChangePrint = useCallback(
		(rowId: string, newCard: ScryfallCard) => {
			changePrint(rowId, newCard.id);
		},
		[changePrint]
	);

	const representativeCards = useMemo(
		() =>
			stacks
				.map((stack) => stack.cards[0])
				.filter((c): c is NonNullable<typeof c> => c !== undefined),
		[stacks]
	);

	const stackByCardId = useMemo(() => {
		const map = new Map<string, CardStack>();
		for (const stack of stacks) {
			const rep = stack.cards[0];
			if (rep) map.set(rep.id, stack);
		}
		return map;
	}, [stacks]);

	const stackByRowId = useMemo(() => {
		const map = new Map<string, CardStack>();
		for (const stack of stacks) {
			for (const card of stack.cards) map.set(card.entry.rowId, stack);
		}
		return map;
	}, [stacks]);

	const handleRequestMove = useCallback(
		(rowId: string) => {
			const stack = stackByRowId.get(rowId);
			if (stack) setMovingStack(stack);
		},
		[stackByRowId]
	);

	const openDeckModalForStack = useCallback((stack: CardStack) => {
		const rep = stack.cards[0];
		if (!rep) return;
		setDeckModal({
			card: rep as ScryfallCard,
			ownedRowIds: stack.cards.map((c) => c.entry.rowId),
		});
	}, []);

	const handleModalAddToDeck = useCallback(
		(card: ScryfallCard) => {
			const stack = stackByCardId.get(card.id);
			if (stack) openDeckModalForStack(stack);
			else setDeckModal({ card, ownedRowIds: [] });
		},
		[stackByCardId, openDeckModalForStack]
	);

	const totalCards = entries.length;
	const uniqueCards = stacks.length;

	if (!isLoaded) {
		return <div className={styles.page} />;
	}

	return (
		<div className={styles.page}>
			<main className={styles.main}>
				<div className={styles.titleSection}>
					<div className={styles.titleLeft}>
						<h1 className={styles.title}>
							<WishlistIcon size={22} /> My Wishlist
						</h1>
						{entries.length > 0 && !isHydrating && (
							<p className={styles.statsLine}>
								{totalCards} card{totalCards !== 1 ? 's' : ''} &middot; {uniqueCards} unique
							</p>
						)}
					</div>
					{entries.length > 0 && (
						<div className={styles.actions}>
							<Button
								variant="secondary"
								onClick={() => setPdfSettingsModalOpen(true)}
								disabled={isHydrating}
							>
								Generate PDF
							</Button>
							<Button variant="danger" onClick={handleClearWishlist}>
								Clear
							</Button>
						</div>
					)}
				</div>

				{entries.length === 0 ? (
					<div className={styles.emptyState}>
						<h2>Your wishlist is empty</h2>
						<p>Search for cards or browse your decks to add cards you want to acquire.</p>
						<Link href="/search">
							<Button variant="primary">Search for cards</Button>
						</Link>
					</div>
				) : (
					<CardList
						cards={representativeCards}
						isLoading={isHydrating}
						onCardClick={(card) => {
							const stack = stackByCardId.get(card.id);
							if (stack) handleCardClick(stack);
						}}
						onCardContextMenu={(card, e) => {
							const stack = stackByCardId.get(card.id);
							if (stack) cardMenu.open(stack, e);
						}}
						renderOverlay={(card) => {
							const stack = stackByCardId.get(card.id);
							const count = stack?.cards.length ?? 1;
							const countBadge =
								count > 1 ? <span className={styles.cardBadge}>x{count}</span> : undefined;
							const deckBadge = stack ? <DeckBadge cards={stack.cards} /> : undefined;
							return withCustomBadge(
								card,
								<>
									{deckBadge}
									{countBadge}
								</>
							);
						}}
						tableColumns={[
							{ key: 'name', label: 'Nom' },
							{
								key: 'set',
								label: 'Set',
								render: (card) => ('set' in card ? (card.set as string).toUpperCase() : '—'),
							},
							{
								key: 'collector_number',
								label: 'Collector #',
								render: (card) =>
									'collector_number' in card ? (card.collector_number as string) : '—',
							},
							{
								key: 'condition',
								label: 'Condition',
								render: (card) => ('entry' in card ? (card.entry.condition ?? '—') : '—'),
							},
							{
								key: 'foil',
								label: 'Foil',
								render: (card) => ('entry' in card ? (card.entry.foilType ?? '—') : '—'),
							},
							{
								key: 'prices',
								label: 'Prix USD',
								render: (card) =>
									'prices' in card && card.prices && 'usd' in card.prices
										? (card.prices.usd ?? '—')
										: '—',
							},
						]}
					/>
				)}
			</main>

			<CardModal
				cards={resolvedStack?.cards ?? null}
				onClose={handleCloseModal}
				onRemoveEntry={handleRemoveEntry}
				onChangePrint={handleChangePrint}
				onMoveToCollection={handleRequestMove}
				onAddToDeck={handleModalAddToDeck}
			/>
			{deckModal && (
				<AddToDeckModal
					card={deckModal.card}
					ownedRowIds={deckModal.ownedRowIds}
					onClose={() => setDeckModal(null)}
				/>
			)}
			{pdfSettingsModalOpen && (
				<PdfSettingsModal
					cards={pdfCards}
					generating={pdfGenerating}
					onConfirm={(settings) => {
						void (async () => {
							setPdfGenerating(true);
							try {
								// Resolve localized images (cache hit → instant; miss → fetched
								// via the shared Scryfall throttle, serialized and 429-safe).
								const resolved = await Promise.all(
									pdfCards.map((c) => resolveLocalizedImageUris(c, 'normal'))
								);
								const imageUrls = resolved.flat().filter((url): url is string => !!url);
								await generateCardsPdf(imageUrls, settings, 'wishlist.pdf');
								setPdfSettingsModalOpen(false);
							} finally {
								setPdfGenerating(false);
							}
						})();
					}}
					onClose={() => setPdfSettingsModalOpen(false)}
				/>
			)}

			{movingStack && movingStack.cards[0] && (
				<EditCardModal
					mode="add"
					scryfallCard={movingStack.cards[0] as ScryfallCard}
					initialEntry={buildInitialEntry(movingStack.cards[0].entry)}
					maxQuantity={movingStack.cards.length}
					hideQuantity={movingStack.cards.length <= 1}
					onAdd={(selectedPrint, entry, count) => {
						const rowIds = movingStack.cards.slice(0, count).map((c) => c.entry.rowId);
						moveToCollection(rowIds, selectedPrint.id, entry);
						setMovingStack(null);
						handleCloseModal();
					}}
					onClose={() => setMovingStack(null)}
				/>
			)}

			{cardMenu.menu && (
				<ContextMenu
					items={buildWishlistMenuItems(
						cardMenu.menu.data,
						{
							onViewDetails: handleCardClick,
							onAddCopy: duplicateEntry,
							onRemoveCopy: removeFromWishlist,
							onMoveToCollection: handleRequestMove,
							onAddToDeck: openDeckModalForStack,
							onChangePrint: handleCardClick,
							onRemoveFromWishlist: removeFromWishlist,
						},
						cardMenu.close
					)}
					position={cardMenu.menu.position}
					onClose={cardMenu.close}
				/>
			)}
		</div>
	);
}

export default function WishlistPage() {
	return (
		<ActiveCardProvider>
			<WishlistPageInner />
		</ActiveCardProvider>
	);
}
