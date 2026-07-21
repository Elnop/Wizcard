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
import { useCollectionCards } from '@/lib/collection/hooks/useCollectionCards';
import { CardList } from '@/lib/card/components/CardList/CardList';
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
import styles from './page.module.css';

function WishlistPageInner() {
	const t = useTranslations('wishlist');
	const menuLabels = useOwnedCardMenuLabels('wishlist');
	const { entries, isLoaded, clearWishlist, moveToCollection } = useWishlistContext();
	const { status: importStatus, openModal: openImportModal } = useImportContext();

	const { stacks, isLoading: isHydrating } = useCollectionCards(entries);

	const { openAddToDeck } = useAddToDeckModal();
	const { openCardModal, close: closeCardModal } = useCardModalContext();
	const pdf = useWishlistPdf(stacks);
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
						{entries.length > 0 && !isHydrating && (
							<p className={styles.statsLine}>
								{t('stats', { cards: totalCards, unique: uniqueCards })}
							</p>
						)}
					</div>
					<div className={styles.actions}>
						{entries.length > 0 && (
							<>
								<Button variant="secondary" onClick={pdf.openModal} disabled={isHydrating}>
									{t('generatePdf')}
								</Button>
								<ExportMenu
									cards={stacks.flatMap((s) => s.cards)}
									filenameBase="my-wishlist"
									disabled={isImporting || isHydrating}
								/>
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
