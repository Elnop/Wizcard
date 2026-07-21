'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { CardStack } from '@/types/cards';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useImportContext } from '@/lib/import/context/ImportContext';
import { CollectionCardsProvider, useCollectionCardsContext } from './CollectionCardsContext';
import { ImportModal } from './lib/ImportModal/ImportModal';
import { useAddToDeckModal } from '@/contexts/AddToDeckModalProvider';
import { useCardModalContext } from '@/contexts/CardModalProvider';
import { useCardMutations } from '@/lib/card/hooks/useCardMutations';
import { buildOwnedCardMenu } from '@/lib/card/ownedCardMenu';
import { useOwnedCardMenuLabels } from '@/lib/card/hooks/useOwnedCardMenuLabels';
import { Button } from '@/components/Button/Button';
import { ExportMenu } from './ExportMenu/ExportMenu';
import styles from './page.module.css';
import { CollectionView } from './lib/CollectionView/CollectionView';
import { CollectionSearchPanel } from './lib/CollectionSearchPanel';

function CollectionPageInner() {
	const t = useTranslations('collection');
	const menuLabels = useOwnedCardMenuLabels('collection');
	const { entries, isLoaded, isFullyLoaded, clearCollection } = useCollectionContext();
	const { stacks, isLoading: isHydrating, totalExpected } = useCollectionCardsContext();
	const { status, openModal } = useImportContext();

	const { openAddToDeck } = useAddToDeckModal();
	const { openCardModal } = useCardModalContext();
	const mutations = useCardMutations();

	const [panelOpen, setPanelOpen] = useState(false);
	const [panelExpanded, setPanelExpanded] = useState(false);
	const closePanel = useCallback(() => {
		setPanelOpen(false);
		setPanelExpanded(false);
	}, []);

	const openCard = useCallback((stack: CardStack) => openCardModal(stack.cards), [openCardModal]);

	const handleClearCollection = useCallback(() => {
		if (confirm(t('clearConfirm'))) {
			clearCollection();
		}
	}, [clearCollection, t]);

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
			<h2>{t('emptyTitle')}</h2>
			<p>{t('emptyDescription')}</p>
			<Link href="/search">
				<Button variant="primary">{t('searchForCards')}</Button>
			</Link>
		</div>
	);

	const actions = (
		<>
			{entries.length > 0 && (
				<>
					<ExportMenu
						cards={stacks.flatMap((s) => s.cards)}
						filenameBase="my-collection"
						disabled={isBusy || isLoadingCollection}
					/>
					<Button variant="danger" onClick={handleClearCollection} disabled={isBusy}>
						{t('clear')}
					</Button>
				</>
			)}
			<Button variant="secondary" onClick={() => setPanelOpen(true)} disabled={isBusy}>
				{t('addCards')}
			</Button>
			<Button variant="primary" onClick={() => openModal('collection')} disabled={isBusy}>
				{isBusy ? t('importing') : t('import')}
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
			title={t('title')}
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
					close,
					menuLabels
				)
			}
			showDeckBadges
			panelOpen={panelOpen && !panelExpanded}
		>
			<ImportModal />
			{panelOpen && (
				<CollectionSearchPanel
					expanded={panelExpanded}
					onToggleExpand={() => setPanelExpanded((v) => !v)}
					onClose={closePanel}
				/>
			)}
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
