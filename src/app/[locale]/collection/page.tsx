'use client';

import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { CardStack } from '@/types/cards';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useImportContext } from '@/lib/import/context/ImportContext';
import { useIndexedCollection } from '@/lib/collection-index/hooks/useIndexedCollection';
import { useStackBy } from '@/lib/card/hooks/useStackBy';
import { StackByMenu } from '@/lib/card/components/StackByMenu/StackByMenu';
import { loadCardCopies } from '@/lib/collection-index/load-card-copies';
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
import { useStackSelection } from '@/lib/card/bulk/useStackSelection';
import { BulkActionBar } from '@/lib/card/bulk/BulkActionBar';
import { BulkEditModal } from '@/lib/card/bulk/BulkEditModal';
import { SelectModeButton } from '@/lib/card/bulk/SelectModeButton';
import type { BulkField } from '@/lib/card/bulk/bulk-edit';
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal';
import { planCollectionRemove } from '@/lib/collection/bulk-plans';
import { BulkAddToDeckModal } from './lib/BulkAddToDeckModal/BulkAddToDeckModal';

const COLLECTION_FIELDS: readonly BulkField[] = [
	'tagsAdd',
	'tagsRemove',
	'condition',
	'language',
	'finish',
	'proxy',
	'forTrade',
	'alter',
	'purchasePrice',
];

function CollectionPageInner() {
	const t = useTranslations('collection');
	const menuLabels = useOwnedCardMenuLabels('collection');
	const tBulk = useTranslations('bulk');
	const {
		entries,
		isLoaded,
		clearCollection,
		collection,
		bulkUpdate,
		bulkRemove,
		bulkAssignToDeck,
	} = useCollectionContext();
	const [stackBy, setStackBy] = useStackBy('collection');
	const model = useIndexedCollection(entries, { filterable: true, stackBy });
	const { status, openModal } = useImportContext();
	const selection = useStackSelection(
		model.allStacks,
		`${JSON.stringify(model.filters)}|${JSON.stringify(stackBy)}`
	);
	const [bulkModal, setBulkModal] = useState<'edit' | 'deck' | 'remove' | null>(null);
	const selectedCopies = useMemo(
		() =>
			selection.selectedRowIds.flatMap((rowId) =>
				collection[rowId] ? [{ rowId, entry: collection[rowId].entry }] : []
			),
		[selection.selectedRowIds, collection]
	);
	const closeBulkModal = useCallback(() => setBulkModal(null), []);

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

	const emptyState = (
		<div className={styles.emptyState}>
			<h2>{t('emptyTitle')}</h2>
			<p>{t('emptyDescription')}</p>
			<Link href="/search">
				<Button variant="primary">{t('searchForCards')}</Button>
			</Link>
		</div>
	);

	const detachCount = planCollectionRemove(selectedCopies).detachIds.length;

	const actions = (
		<>
			{entries.length > 0 && (
				<>
					<ExportMenu
						cards={() => loadCardCopies(entries)}
						filenameBase="my-collection"
						disabled={isBusy}
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
			model={model}
			entryCount={entries.length}
			isLoaded={isLoaded}
			title={t('title')}
			actions={actions}
			emptyState={emptyState}
			toolbarExtra={
				<>
					<StackByMenu value={stackBy} onChange={setStackBy} />
					<SelectModeButton active={selection.selectMode} onToggle={selection.toggleMode} />
				</>
			}
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
			selection={{
				active: selection.selectMode,
				isSelected: (key) => selection.selected.has(key),
				toggle: selection.toggle,
			}}
		>
			<ImportModal />
			{selection.selectMode && (
				<BulkActionBar
					summary={tBulk('summary', {
						stacks: selection.stackCount,
						copies: selection.selectedRowIds.length,
					})}
					allSelected={selection.allSelected}
					selectAllDisabled={model.isInitialLoading}
					onToggleSelectAll={() => selection.toggleSelectAll(selection.allKeys)}
					hasSelection={selection.selectedRowIds.length > 0}
					actions={[
						{ id: 'edit', label: tBulk('edit'), onClick: () => setBulkModal('edit') },
						{ id: 'deck', label: tBulk('addToDeck'), onClick: () => setBulkModal('deck') },
						{
							id: 'remove',
							label: tBulk('remove'),
							onClick: () => setBulkModal('remove'),
							danger: true,
						},
					]}
					onClear={selection.clear}
					onExit={selection.exit}
					escapeDisabled={bulkModal !== null}
				/>
			)}
			{bulkModal === 'edit' && (
				<BulkEditModal
					title={tBulk('editTitle', { count: selectedCopies.length })}
					fields={COLLECTION_FIELDS}
					onApply={(edit) => {
						bulkUpdate(selection.selectedRowIds, edit);
						selection.clear();
					}}
					onClose={closeBulkModal}
				/>
			)}
			{bulkModal === 'deck' && (
				<BulkAddToDeckModal
					copies={selectedCopies}
					onConfirm={(deckId, zone) => {
						bulkAssignToDeck(selection.selectedRowIds, deckId, zone);
						selection.clear();
					}}
					onClose={closeBulkModal}
				/>
			)}
			{bulkModal === 'remove' && (
				<ConfirmModal
					message={tBulk('confirmRemoveCollection', { count: selectedCopies.length })}
					confirmLabel={tBulk('remove')}
					onConfirm={() => {
						bulkRemove(selection.selectedRowIds);
						selection.clear();
						setBulkModal(null);
					}}
					onClose={closeBulkModal}
				>
					{detachCount > 0 && <p>{tBulk('detachNotice', { count: detachCount })}</p>}
				</ConfirmModal>
			)}
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
	return <CollectionPageInner />;
}
