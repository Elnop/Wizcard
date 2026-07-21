'use client';
import { useTranslations } from 'next-intl';
import { SearchPanelCore } from './SearchPanelCore';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import type { ContextMenuAction } from '@/components/ContextMenu/ContextMenu';

export type PlainCardSearchPanelProps = {
	/** Left-click on a result (collection/wishlist: open the card modal). */
	onCardClick: (card: AnyCard) => void;
	/** Right-click context menu (collection/wishlist: the search-page menu). */
	buildCardMenuItems: (card: AnyCard, close: () => void) => ContextMenuAction[];
	onClose: () => void;
	expanded: boolean;
	onToggleExpand?: () => void;
};

/**
 * Card search panel for pages without a deck (collection, wishlist). Reuses the
 * shared SearchPanelCore with every deck-only feature off: no EDHREC tab, no
 * legality toggle, no zone badges, no in-collection overlay. Results use the
 * default custom-badge overlay (as on the /search page).
 */
export function PlainCardSearchPanel({
	onCardClick,
	buildCardMenuItems,
	onClose,
	expanded,
	onToggleExpand,
}: PlainCardSearchPanelProps) {
	// Reuse the existing decks.addCards title string (shared panel copy).
	const t = useTranslations('decks');
	return (
		<SearchPanelCore
			title={t('addCards')}
			expanded={expanded}
			onToggleExpand={onToggleExpand}
			onClose={onClose}
			onCardClick={onCardClick}
			buildCardMenuItems={buildCardMenuItems}
		/>
	);
}
