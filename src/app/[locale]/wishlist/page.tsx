'use client';

import { useMemo, useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { CardStack } from '@/types/cards';
import { useAddToDeckModal } from '@/contexts/AddToDeckModalProvider';
import { useCardModalContext } from '@/contexts/CardModalProvider';
import { useCardMutations } from '@/lib/card/hooks/useCardMutations';
import { useWishlistContext } from '@/lib/wishlist/context/WishlistContext';
import { WishlistIcon } from '@/lib/wishlist/components/WishlistIcon';
import { useImportContext } from '@/lib/import/context/ImportContext';
import { useIndexedCollection } from '@/lib/collection-index/hooks/useIndexedCollection';
import { useStackBy } from '@/lib/card/hooks/useStackBy';
import { StackByMenu } from '@/lib/card/components/StackByMenu/StackByMenu';
import { loadCardCopies } from '@/lib/collection-index/load-card-copies';
import { CardList } from '@/lib/card/components/CardList/CardList';
import { cardKey } from '@/lib/card/utils/card-key';
import { DeckBadge } from '@/lib/card/components/DeckBadge/DeckBadge';
import { Button } from '@/components/Button/Button';
import { ExportMenu } from '@/app/[locale]/collection/ExportMenu/ExportMenu';
import { ImportModal } from '@/app/[locale]/collection/lib/ImportModal/ImportModal';
import { PdfSettingsModal } from '@/components/PdfSettingsModal/PdfSettingsModal';
import { withCustomBadge } from '@/lib/card/utils/composeOverlay';
import { buildOwnedCardMenu } from '@/lib/card/ownedCardMenu';
import { useOwnedCardMenuLabels } from '@/lib/card/hooks/useOwnedCardMenuLabels';
import { useWishlistPdf } from './useWishlistPdf';
import { useMoveToCollection } from './useMoveToCollection';
import { WishlistSearchPanel } from './WishlistSearchPanel';
import { PAGE_SIZE } from '@/lib/collection/constants';
import { useStackSelection } from '@/lib/card/bulk/useStackSelection';
import { BulkActionBar } from '@/lib/card/bulk/BulkActionBar';
import { BulkEditModal } from '@/lib/card/bulk/BulkEditModal';
import { BulkSelectOverlay } from '@/lib/card/bulk/BulkSelectOverlay';
import { SelectModeButton } from '@/lib/card/bulk/SelectModeButton';
import type { BulkField } from '@/lib/card/bulk/bulk-edit';
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal';
import collectionViewStyles from '@/app/[locale]/collection/lib/CollectionView/CollectionView.module.css';
import styles from './page.module.css';

const WISHLIST_FIELDS: readonly BulkField[] = [
	'tagsAdd',
	'tagsRemove',
	'condition',
	'language',
	'finish',
];

function WishlistPageInner() {
	const t = useTranslations('wishlist');
	const tCollection = useTranslations('collection');
	const tError = useTranslations('error');
	const menuLabels = useOwnedCardMenuLabels('wishlist');
	const {
		entries,
		isLoaded,
		clearWishlist,
		moveToCollection,
		bulkUpdate,
		bulkRemove,
		bulkMoveToCollection,
	} = useWishlistContext();
	const tBulk = useTranslations('bulk');
	const { status: importStatus, openModal: openImportModal } = useImportContext();

	const [stackBy, setStackBy] = useStackBy('wishlist');
	const model = useIndexedCollection(entries, { filterable: false, stackBy });
	const stacks = model.visibleStacks;
	const selection = useStackSelection(model.allStacks, JSON.stringify(stackBy));
	const [bulkModal, setBulkModal] = useState<'edit' | 'move' | 'remove' | null>(null);
	const closeBulkModal = useCallback(() => setBulkModal(null), []);
	const copyCount = selection.selectedRowIds.length;

	const { openAddToDeck } = useAddToDeckModal();
	const { openCardModal, close: closeCardModal } = useCardModalContext();
	const loadAll = useCallback(() => loadCardCopies(entries), [entries]);
	const pdf = useWishlistPdf(loadAll);
	const move = useMoveToCollection(stacks, moveToCollection, closeCardModal);
	const mutations = useCardMutations();

	const [panelOpen, setPanelOpen] = useState(false);
	const [panelExpanded, setPanelExpanded] = useState(false);
	const closePanel = useCallback(() => {
		setPanelOpen(false);
		setPanelExpanded(false);
	}, []);

	const handleCardClick = useCallback(
		(stack: CardStack) => openCardModal(stack.cards),
		[openCardModal]
	);

	const handleClearWishlist = useCallback(() => {
		if (confirm(t('clearConfirm'))) {
			clearWishlist();
		}
	}, [clearWishlist, t]);

	const representativeCards = useMemo(
		() =>
			stacks
				.map((stack) => stack.cards[0])
				.filter((c): c is NonNullable<typeof c> => c !== undefined),
		[stacks]
	);

	// Grid cards are stack representatives; map them back to their stack to wire
	// click / context-menu / overlay against the full stack. Keyed by the
	// representative's rowId: several stacks can share one print id once
	// stacking is finer than by-name (e.g. foil vs non-foil).
	const stackByRowId = useMemo(() => {
		const map = new Map<string, CardStack>();
		for (const stack of stacks) {
			const rep = stack.cards[0];
			if (rep) map.set(rep.entry.rowId, stack);
		}
		return map;
	}, [stacks]);

	const isImporting =
		importStatus === 'parsing' ||
		importStatus === 'previewing' ||
		importStatus === 'fetching' ||
		importStatus === 'merging';

	if (!isLoaded) {
		return <div className={styles.page} />;
	}

	return (
		<div className={`${styles.page} ${panelOpen && !panelExpanded ? styles.withPanel : ''}`.trim()}>
			<main className={styles.main}>
				<div className={styles.titleSection}>
					<div className={styles.titleLeft}>
						<h1 className={styles.title}>
							<WishlistIcon size={22} /> {t('title')}
						</h1>
						{entries.length > 0 && !model.isInitialLoading && (
							<p className={styles.statsLine}>
								{t('stats', { cards: entries.length, unique: model.stats.uniqueCards })}
							</p>
						)}
					</div>
					<div className={styles.actions}>
						{entries.length > 0 && (
							<>
								<Button variant="secondary" onClick={pdf.openModal} disabled={pdf.isPreparing}>
									{pdf.isPreparing ? t('preparingPdf') : t('generatePdf')}
								</Button>
								<ExportMenu cards={loadAll} filenameBase="my-wishlist" disabled={isImporting} />
								<Button variant="danger" onClick={handleClearWishlist} disabled={isImporting}>
									{t('clear')}
								</Button>
							</>
						)}
						<Button variant="secondary" onClick={() => setPanelOpen(true)} disabled={isImporting}>
							{t('addCards')}
						</Button>
						<Button
							variant="primary"
							onClick={() => openImportModal('wishlist')}
							disabled={isImporting}
						>
							{isImporting ? t('importing') : t('import')}
						</Button>
					</div>
				</div>

				{entries.length === 0 ? (
					<div className={styles.emptyState}>
						<h2>{t('emptyTitle')}</h2>
						<p>{t('emptyDescription')}</p>
						<Link href="/search">
							<Button variant="primary">{t('searchForCards')}</Button>
						</Link>
					</div>
				) : (
					<>
						<CardList
							cards={representativeCards}
							viewModes={selection.selectMode ? ['grid'] : ['grid', 'table']}
							toolbarExtra={
								<>
									<StackByMenu value={stackBy} onChange={setStackBy} />
									<SelectModeButton active={selection.selectMode} onToggle={selection.toggleMode} />
								</>
							}
							isLoading={model.isInitialLoading}
							skeletonCount={Math.min(PAGE_SIZE, entries.length)}
							pageSize={false}
							hasMore={model.hasMore && !model.error}
							onLoadMore={model.loadMore}
							isLoadingMore={model.isLoadingMore}
							onCardClick={(card) => {
								const stack = stackByRowId.get(cardKey(card));
								if (!stack) return;
								if (selection.selectMode) selection.toggle(stack.key);
								else handleCardClick(stack);
							}}
							buildCardMenuItems={
								selection.selectMode
									? undefined
									: (card, close) => {
											const stack = stackByRowId.get(cardKey(card));
											return stack
												? buildOwnedCardMenu(
														stack,
														'wishlist',
														{
															onViewDetails: handleCardClick,
															onAddCopy: (rep) => mutations.wishlist.duplicate(rep.id, rep.entry),
															onRemoveCopy: (rep) => mutations.wishlist.remove(rep.entry.rowId),
															onMove: (rep) => move.requestMove(rep.entry.rowId),
															onAddToDeck: (s) => openAddToDeck(s.cards[0]),
															onChangePrint: handleCardClick,
															onRemove: (rep) => mutations.wishlist.remove(rep.entry.rowId),
														},
														close,
														menuLabels
													)
												: null;
										}
							}
							renderOverlay={(card) => {
								const stack = stackByRowId.get(cardKey(card));
								const count = stack?.cards.length ?? 1;
								const countBadge =
									count > 1 ? <span className={styles.cardBadge}>x{count}</span> : undefined;
								const deckBadge = stack ? <DeckBadge cards={stack.cards} /> : undefined;
								if (selection.selectMode && stack) {
									return withCustomBadge(
										card,
										<>
											<BulkSelectOverlay checked={selection.selected.has(stack.key)} />
											{countBadge}
										</>
									);
								}
								return withCustomBadge(
									card,
									<>
										{deckBadge}
										{countBadge}
									</>
								);
							}}
							tableColumns={[
								{ key: 'name', label: t('colName') },
								{
									key: 'set',
									label: t('colSet'),
									render: (card) => ('set' in card ? (card.set as string).toUpperCase() : '—'),
								},
								{
									key: 'collector_number',
									label: t('colCollector'),
									render: (card) =>
										'collector_number' in card ? (card.collector_number as string) : '—',
								},
								{
									key: 'condition',
									label: t('colCondition'),
									render: (card) => ('entry' in card ? (card.entry.condition ?? '—') : '—'),
								},
								{
									key: 'foil',
									label: t('colFoil'),
									render: (card) => ('entry' in card ? (card.entry.foilType ?? '—') : '—'),
								},
								{
									key: 'prices',
									label: t('colPriceUsd'),
									render: (card) =>
										'prices' in card && card.prices && 'usd' in card.prices
											? (card.prices.usd ?? '—')
											: '—',
								},
							]}
						/>
						{model.error && (
							<div className={collectionViewStyles.loadError} role="alert">
								<p>{tCollection('loadError')}</p>
								<Button variant="secondary" onClick={model.retry}>
									{tError('retry')}
								</Button>
							</div>
						)}
					</>
				)}
			</main>

			{pdf.isModalOpen && (
				<PdfSettingsModal
					cards={pdf.pdfCards}
					generating={pdf.isGenerating}
					onConfirm={pdf.generate}
					onClose={pdf.closeModal}
				/>
			)}

			<ImportModal />

			{selection.selectMode && (
				<BulkActionBar
					summary={tBulk('summary', { stacks: selection.stackCount, copies: copyCount })}
					allSelected={selection.allSelected}
					selectAllDisabled={model.isInitialLoading}
					onToggleSelectAll={() => selection.toggleSelectAll(selection.allKeys)}
					hasSelection={copyCount > 0}
					actions={[
						{ id: 'edit', label: tBulk('edit'), onClick: () => setBulkModal('edit') },
						{ id: 'move', label: tBulk('moveToCollection'), onClick: () => setBulkModal('move') },
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
					title={tBulk('editTitle', { count: copyCount })}
					fields={WISHLIST_FIELDS}
					onApply={(edit) => {
						bulkUpdate(selection.selectedRowIds, edit);
						selection.clear();
					}}
					onClose={closeBulkModal}
				/>
			)}
			{bulkModal === 'move' && (
				<ConfirmModal
					message={tBulk('confirmMoveToCollection', { count: copyCount })}
					confirmLabel={tBulk('confirm')}
					onConfirm={() => {
						bulkMoveToCollection(selection.selectedRowIds);
						selection.clear();
						setBulkModal(null);
					}}
					onClose={closeBulkModal}
				/>
			)}
			{bulkModal === 'remove' && (
				<ConfirmModal
					message={tBulk('confirmRemoveWishlist', { count: copyCount })}
					confirmLabel={tBulk('remove')}
					onConfirm={() => {
						bulkRemove(selection.selectedRowIds);
						selection.clear();
						setBulkModal(null);
					}}
					onClose={closeBulkModal}
				/>
			)}

			{panelOpen && (
				<WishlistSearchPanel
					expanded={panelExpanded}
					onToggleExpand={() => setPanelExpanded((v) => !v)}
					onClose={closePanel}
				/>
			)}
		</div>
	);
}

export default function WishlistPage() {
	return <WishlistPageInner />;
}
