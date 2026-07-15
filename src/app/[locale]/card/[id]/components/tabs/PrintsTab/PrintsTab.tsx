'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { CustomCard } from '@/lib/mpc/types';
import { isCustomCard } from '@/lib/mpc/types';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import type { CardListSection } from '@/lib/card/components/CardList/CardList.types';
import { useCardPrints } from '@/lib/scryfall/hooks/useCardPrints';
import { CardList } from '@/lib/card/components/CardList/CardList';
import { groupPrintsByLang } from '@/lib/card/components/PrintList/PrintList.types';
import { useAddCardModal } from '@/contexts/AddCardModalProvider';
import { useCardModalContext } from '@/contexts/CardModalProvider';
import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useWishlistContext } from '@/lib/wishlist/context/WishlistContext';
import { LocalizedCardThumb } from '../../LocalizedCardThumb';
import { useCustomCardPrints } from '@/lib/mpc/hooks/useCustomCardPrints';
import { PrintContextMenu } from './PrintContextMenu';
import styles from './PrintsTab.module.css';

const MENU_WIDTH = 200;
const MENU_HEIGHT = 100;

interface Props {
	card: ScryfallCard | CustomCard;
}

function MiniThumb({ card }: { card: ScryfallCard }): ReactNode {
	return (
		<LocalizedCardThumb card={card} size="small" width={40} height={56} className={styles.thumb} />
	);
}

export function PrintsTab({ card }: Props) {
	const t = useTranslations('card');
	const custom = isCustomCard(card) ? card : null;
	const scryfall = custom ? null : (card as ScryfallCard);

	const printsUri =
		scryfall?.prints_search_uri ??
		(card.oracle_id
			? `https://api.scryfall.com/cards/search?q=oracle_id%3A${card.oracle_id}&unique=prints&order=released`
			: undefined);

	const { prints, loading } = useCardPrints(printsUri);
	const { prints: customPrints, loading: customLoading } = useCustomCardPrints(
		card.oracle_id,
		card.id
	);

	const { addCards } = useCollectionContext();
	const { addToWishlist } = useWishlistContext();
	const { openAddCard } = useAddCardModal();
	const { openCardModal } = useCardModalContext();
	const { profile } = useProfileContext();

	const [contextMenuCard, setContextMenuCard] = useState<ScryfallCard | null>(null);
	const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);

	const currentLang = scryfall?.lang ?? custom?.custom.lang ?? 'en';
	const hasCustomPrints = customPrints.length > 0;

	let officialSections: CardListSection[] = [];
	if (prints.length > 0) {
		// groupPrintsByLang drops placeholder-only languages, so byLang may be empty
		// even when prints exist — omit the official section entirely in that case.
		const byLang = groupPrintsByLang(prints, currentLang, profile?.language);
		if (byLang.length > 0) {
			officialSections = hasCustomPrints
				? [{ label: t('officialPrints'), cards: [], children: byLang }]
				: byLang;
		}
	}

	const customSection: CardListSection | null =
		customPrints.length > 0
			? {
					label: t('customCards'),
					cards: customPrints as unknown as AnyCard[],
				}
			: null;

	const sections: CardListSection[] = [
		...officialSections,
		...(customSection ? [customSection] : []),
	];

	return (
		<>
			<CardList
				cards={sections}
				isLoading={loading || customLoading}
				pageSize={false}
				onCardClick={(p) => openCardModal(p as ScryfallCard)}
				onCardContextMenu={(p, e) => {
					e.preventDefault();
					const x = e.clientX + MENU_WIDTH > window.innerWidth ? e.clientX - MENU_WIDTH : e.clientX;
					const y =
						e.clientY + MENU_HEIGHT > window.innerHeight ? e.clientY - MENU_HEIGHT : e.clientY;
					setContextMenuCard(p as ScryfallCard);
					setContextMenuPos({ x, y });
				}}
				tableColumns={[
					{
						key: 'image',
						label: '',
						render: (p: AnyCard) => <MiniThumb card={p as ScryfallCard} />,
					},
					{
						key: 'set',
						label: t('colPrint'),
						render: (p: AnyCard) => {
							const c = p as ScryfallCard;
							const isProxy = c.set === 'mpc';
							return (
								<>
									<div className={styles.printName}>{c.set_name}</div>
									<div className={styles.printMeta}>
										{isProxy ? (
											<span className={styles.proxyBadge}>proxy</span>
										) : (
											`#${c.collector_number}`
										)}
									</div>
								</>
							);
						},
					},
					{
						key: 'rarity',
						label: t('rarity'),
						render: (p: AnyCard) => {
							const c = p as ScryfallCard;
							if (c.set === 'mpc') return null;
							return (c.rarity ?? '').charAt(0).toUpperCase() + (c.rarity ?? '').slice(1);
						},
					},
					{
						key: 'current',
						label: '',
						render: (p: AnyCard) => {
							if ((p as ScryfallCard).id === card.id) {
								return <span className={styles.currentBadge}>{t('shown')}</span>;
							}
							return null;
						},
					},
				]}
			/>

			{contextMenuCard && (
				<PrintContextMenu
					card={contextMenuCard}
					pos={contextMenuPos}
					onClose={() => {
						setContextMenuCard(null);
						setContextMenuPos(null);
					}}
					onAddToCollection={(c) =>
						openAddCard({
							scryfallCard: c,
							onAdd: (selectedPrint, entry, count) => addCards(selectedPrint, count, entry),
						})
					}
					onAddToWishlist={(c) =>
						openAddCard({
							scryfallCard: c,
							onAdd: (selectedPrint, entry, count) => addToWishlist(selectedPrint, entry, count),
						})
					}
				/>
			)}
		</>
	);
}
