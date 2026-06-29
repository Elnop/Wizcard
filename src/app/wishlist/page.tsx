'use client';

import { useMemo, useCallback } from 'react';
import Link from 'next/link';
import type { CardStack } from '@/types/cards';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { EditCardModal } from '@/lib/card/components/EditCardModal/EditCardModal';
import { AddToDeckModal } from '@/lib/card/components/AddToDeckModal/AddToDeckModal';
import { useAddToDeckModal } from '@/lib/card/hooks/useAddToDeckModal';
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
import { withCustomBadge } from '@/lib/card/utils/composeOverlay';
import { buildWishlistMenuItems } from './wishlistCardMenu';
import { useWishlistPdf } from './useWishlistPdf';
import { useMoveToCollection } from './useMoveToCollection';
import styles from './page.module.css';

function WishlistPageInner() {
	const {
		entries,
		isLoaded,
		duplicateEntry,
		removeFromWishlist,
		clearWishlist,
		moveToCollection,
		assignToDeck,
		changePrint,
	} = useWishlistContext();

	const { stacks, isLoading: isHydrating } = useCollectionCards(entries);

	const { resolvedStack, handleCardClick, handleCloseModal } = useCardModal(stacks);

	const deck = useAddToDeckModal(stacks, assignToDeck);
	const pdf = useWishlistPdf(stacks);
	const move = useMoveToCollection(stacks, moveToCollection, handleCloseModal);

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

	// Grid cards are stack representatives; map them back to their stack to wire
	// click / context-menu / overlay against the full stack.
	const stackByCardId = useMemo(() => {
		const map = new Map<string, CardStack>();
		for (const stack of stacks) {
			const rep = stack.cards[0];
			if (rep) map.set(rep.id, stack);
		}
		return map;
	}, [stacks]);

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
							<Button variant="secondary" onClick={pdf.openModal} disabled={isHydrating}>
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
						buildCardMenuItems={(card, close) => {
							const stack = stackByCardId.get(card.id);
							return stack
								? buildWishlistMenuItems(
										stack,
										{
											onViewDetails: handleCardClick,
											onAddCopy: duplicateEntry,
											onRemoveCopy: removeFromWishlist,
											onMoveToCollection: move.requestMove,
											onAddToDeck: deck.openForStack,
											onChangePrint: handleCardClick,
											onRemoveFromWishlist: removeFromWishlist,
										},
										close
									)
								: null;
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
				onMoveToCollection={move.requestMove}
				onAddToDeck={deck.openForCard}
			/>
			{deck.deckModal && (
				<AddToDeckModal
					card={deck.deckModal.card}
					ownedRowIds={deck.deckModal.ownedRowIds}
					onAssign={deck.onAssign}
					onClose={deck.close}
				/>
			)}
			{pdf.isModalOpen && (
				<PdfSettingsModal
					cards={pdf.pdfCards}
					generating={pdf.isGenerating}
					onConfirm={pdf.generate}
					onClose={pdf.closeModal}
				/>
			)}

			{move.movingStack && move.movingStack.cards[0] && (
				<EditCardModal
					mode="add"
					scryfallCard={move.movingStack.cards[0] as ScryfallCard}
					initialEntry={move.buildInitialEntry(move.movingStack.cards[0].entry)}
					maxQuantity={move.movingStack.cards.length}
					hideQuantity={move.movingStack.cards.length <= 1}
					onAdd={move.confirmMove}
					onClose={move.cancel}
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
