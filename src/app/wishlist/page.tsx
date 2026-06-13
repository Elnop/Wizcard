'use client';

import { useMemo, useCallback } from 'react';
import Link from 'next/link';
import type { CardStack } from '@/types/cards';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { useWishlistContext } from '@/lib/wishlist/context/WishlistContext';
import { WishlistIcon } from '@/components/WishlistIcon';
import { useCollectionCards } from '@/app/collection/useCollectionCards';
import { useCardModal } from '@/lib/card/hooks/useCardModal';
import { CardModal } from '@/lib/card/components/CardModal/CardModal';
import { CardList } from '@/lib/card/components/CardList/CardList';
import { Button } from '@/components/Button/Button';
import { withCustomBadge } from '@/lib/card/utils/composeOverlay';
import styles from './page.module.css';

export default function WishlistPage() {
	const { entries, isLoaded, removeFromWishlist, clearWishlist, moveToCollection, changePrint } =
		useWishlistContext();

	const { stacks, isLoading: isHydrating } = useCollectionCards(entries);

	const { resolvedStack, handleCardClick, handleCloseModal } = useCardModal(stacks);

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
						renderOverlay={withCustomBadge}
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
				onMoveToCollection={(rowId) => {
					moveToCollection(rowId);
					handleCloseModal();
				}}
			/>
		</div>
	);
}
