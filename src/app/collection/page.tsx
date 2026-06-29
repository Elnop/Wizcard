'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import type { CardStack } from '@/types/cards';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useImportContext } from '@/lib/import/context/ImportContext';
import { CollectionCardsProvider, useCollectionCardsContext } from './CollectionCardsContext';
import { ImportModal } from './lib/ImportModal/ImportModal';
import { useAddToDeckModal } from '@/contexts/AddToDeckModalProvider';
import { useCardModalContext } from '@/contexts/CardModalProvider';
import { useCardMutations } from '@/lib/card/hooks/useCardMutations';
import { buildOwnedCardMenu } from '@/lib/card/ownedCardMenu';
import { Button } from '@/components/Button/Button';
import { ExportMenu } from './ExportMenu/ExportMenu';
import { ShareButton } from '@/components/ShareButton/ShareButton';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import styles from './page.module.css';
import { CollectionView } from './lib/CollectionView/CollectionView';

function CollectionPageInner() {
	const { user } = useAuth();
	const { entries, isLoaded, isFullyLoaded, clearCollection } = useCollectionContext();
	const { stacks, isLoading: isHydrating, totalExpected } = useCollectionCardsContext();
	const { status, openModal } = useImportContext();

	const { openAddToDeck } = useAddToDeckModal();
	const { openCardModal } = useCardModalContext();
	const mutations = useCardMutations();

	const openCard = useCallback((stack: CardStack) => openCardModal(stack.cards), [openCardModal]);

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
				buildOwnedCardMenu(
					stack,
					'collection',
					{
						onViewDetails: openCard,
						onAddCopy: (rep) => mutations.collection.duplicate(rep.id, rep.entry),
						onRemoveCopy: (rep) => mutations.collection.decrement(rep.id),
						onMove: (rep) => mutations.moveToWishlist(rep.entry.rowId),
						onAddToDeck: (s) => openAddToDeck(s.cards[0]),
						onChangePrint: openCard,
						onRemove: (rep) => mutations.collection.remove(rep.id),
					},
					close
				)
			}
			showDeckBadges
		>
			<ImportModal />
		</CollectionView>
	);
}

export default function CollectionPage() {
	return (
		<CollectionCardsProvider>
			<CollectionPageInner />
		</CollectionCardsProvider>
	);
}
