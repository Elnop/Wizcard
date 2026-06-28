'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import type { CardStack } from '@/types/cards';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useWishlistContext } from '@/lib/wishlist/context/WishlistContext';
import { useImportContext } from '@/lib/import/context/ImportContext';
import { CollectionCardsProvider, useCollectionCardsContext } from './CollectionCardsContext';
import {
	ActiveCardProvider,
	useActiveCardContext,
} from './lib/CollectionCardModal/ActiveCardContext';
import { ImportModal } from './lib/ImportModal/ImportModal';
import { CollectionCardModal } from './lib/CollectionCardModal/CollectionCardModal';
import { AddToDeckModal } from '@/lib/card/components/AddToDeckModal/AddToDeckModal';
import { useContextMenu } from '@/components/ContextMenu/useContextMenu';
import { ContextMenu } from '@/components/ContextMenu/ContextMenu';
import { buildCollectionMenuItems } from './collectionCardMenu';
import { Button } from '@/components/Button/Button';
import { ExportMenu } from './ExportMenu/ExportMenu';
import { ShareButton } from '@/components/ShareButton/ShareButton';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import styles from './page.module.css';
import { CollectionView } from './lib/CollectionView/CollectionView';

function CollectionPageInner() {
	const { user } = useAuth();
	const {
		entries,
		isLoaded,
		isFullyLoaded,
		clearCollection,
		duplicateEntry,
		decrementCard,
		removeCard,
	} = useCollectionContext();
	const { moveToWishlist } = useWishlistContext();
	const { stacks, isLoading: isHydrating, totalExpected } = useCollectionCardsContext();
	const { openCard } = useActiveCardContext();
	const { status, openModal } = useImportContext();

	const cardMenu = useContextMenu<CardStack>();
	const [deckModal, setDeckModal] = useState<{ card: ScryfallCard; ownedRowIds: string[] } | null>(
		null
	);

	const handleClearCollection = useCallback(() => {
		if (confirm('Effacer toute la collection ? Cette action est irréversible.')) {
			clearCollection();
		}
	}, [clearCollection]);

	const openDeckModalForStack = useCallback((stack: CardStack) => {
		const rep = stack.cards[0];
		if (!rep) return;
		setDeckModal({
			card: rep as ScryfallCard,
			ownedRowIds: stack.cards.map((c) => c.entry.rowId),
		});
	}, []);

	const stackByCardId = useMemo(() => {
		const map = new Map<string, CardStack>();
		for (const stack of stacks) {
			const rep = stack.cards[0];
			if (rep) map.set(rep.id, stack);
		}
		return map;
	}, [stacks]);

	const handleModalAddToDeck = useCallback(
		(card: ScryfallCard) => {
			const stack = stackByCardId.get(card.id);
			if (stack) openDeckModalForStack(stack);
			else setDeckModal({ card, ownedRowIds: [] });
		},
		[stackByCardId, openDeckModalForStack]
	);

	if (!isLoaded) {
		return <div className={styles.page} />;
	}

	const isBusy =
		status === 'parsing' ||
		status === 'previewing' ||
		status === 'fetching' ||
		status === 'merging';

	const isLoadingCollection = !isFullyLoaded || isHydrating;

	const emptyState = (
		<div className={styles.emptyState}>
			<h2>Your collection is empty</h2>
			<p>Search for cards or import a collection file to get started.</p>
			<Link href="/search">
				<Button variant="primary">Search for cards</Button>
			</Link>
		</div>
	);

	const actions = (
		<>
			{user && <ShareButton path={`/users/${user.id}/collection`} />}
			{entries.length > 0 && (
				<>
					<ExportMenu
						cards={stacks.flatMap((s) => s.cards)}
						filenameBase="my-collection"
						disabled={isBusy || isLoadingCollection}
					/>
					<Button variant="danger" onClick={handleClearCollection} disabled={isBusy}>
						Clear
					</Button>
				</>
			)}
			<Button variant="primary" onClick={openModal} disabled={isBusy}>
				{isBusy ? 'Importing…' : 'Import'}
			</Button>
		</>
	);

	return (
		<CollectionView
			stacks={stacks}
			entryCount={entries.length}
			isHydrating={isHydrating}
			totalExpected={totalExpected}
			isLoaded={isLoaded}
			isFullyLoaded={isFullyLoaded}
			title="My Collection"
			actions={actions}
			emptyState={emptyState}
			onCardClick={openCard}
			onCardContextMenu={(stack, e) => cardMenu.open(stack, e)}
			showDeckBadges
		>
			<ImportModal />
			<CollectionCardModal onAddToDeck={handleModalAddToDeck} />
			{deckModal && (
				<AddToDeckModal
					card={deckModal.card}
					ownedRowIds={deckModal.ownedRowIds}
					onClose={() => setDeckModal(null)}
				/>
			)}
			{cardMenu.menu && (
				<ContextMenu
					items={buildCollectionMenuItems(
						cardMenu.menu.data,
						{
							onViewDetails: openCard,
							onAddCopy: duplicateEntry,
							onRemoveCopy: decrementCard,
							onMoveToWishlist: (rowId) => moveToWishlist([rowId]),
							onAddToDeck: openDeckModalForStack,
							onChangePrint: openCard,
							onRemoveFromCollection: removeCard,
						},
						cardMenu.close
					)}
					position={cardMenu.menu.position}
					onClose={cardMenu.close}
				/>
			)}
		</CollectionView>
	);
}

export default function CollectionPage() {
	return (
		<CollectionCardsProvider>
			<ActiveCardProvider>
				<CollectionPageInner />
			</ActiveCardProvider>
		</CollectionCardsProvider>
	);
}
