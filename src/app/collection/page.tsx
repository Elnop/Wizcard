'use client';

import { useCallback } from 'react';
import Link from 'next/link';
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
import { useAddToDeckModal } from '@/lib/card/hooks/useAddToDeckModal';
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

	const deck = useAddToDeckModal(stacks);

	const handleClearCollection = useCallback(() => {
		if (confirm('Effacer toute la collection ? Cette action est irréversible.')) {
			clearCollection();
		}
	}, [clearCollection]);

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
			buildCardMenuItems={(stack, close) =>
				buildCollectionMenuItems(
					stack,
					{
						onViewDetails: openCard,
						onAddCopy: duplicateEntry,
						onRemoveCopy: decrementCard,
						onMoveToWishlist: (rowId) => moveToWishlist([rowId]),
						onAddToDeck: deck.openForStack,
						onChangePrint: openCard,
						onRemoveFromCollection: removeCard,
					},
					close
				)
			}
			showDeckBadges
		>
			<ImportModal />
			<CollectionCardModal onAddToDeck={deck.openForCard} />
			{deck.deckModal && (
				<AddToDeckModal
					card={deck.deckModal.card}
					ownedRowIds={deck.deckModal.ownedRowIds}
					onClose={deck.close}
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
