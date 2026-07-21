'use client';
import { DeckCardSearchPanel } from './DeckCardSearchPanel';
import { PlainCardSearchPanel } from './PlainCardSearchPanel';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import type { ContextMenuAction } from '@/components/ContextMenu/ContextMenu';
import type { ScryfallCard, ScryfallColor } from '@/lib/scryfall/types/scryfall';
import type { DeckFormat } from '@/types/decks';

export type PanelMode =
	| {
			kind: 'deck';
			deckId: string;
			deckFormat?: DeckFormat | null;
			commanderColorIdentity?: ScryfallColor[];
			commanderName?: string | null;
			onCardClick: (card: ScryfallCard) => void;
			onCollectionModeChange?: (inCollectionOnly: boolean) => void;
	  }
	| {
			kind: 'collection' | 'wishlist';
			onCardClick: (card: AnyCard) => void;
			buildCardMenuItems: (card: AnyCard, close: () => void) => ContextMenuAction[];
	  };

export type CardSearchPanelProps = {
	mode: PanelMode;
	onClose: () => void;
	expanded?: boolean;
	onToggleExpand?: () => void;
};

/**
 * Fixed side panel that searches Scryfall and adds cards. Deck mode keeps the
 * full deck behaviour (zones, EDHREC, legality, commander CI); collection and
 * wishlist modes hide those and delegate add/click to the caller.
 */
export function CardSearchPanel({
	mode,
	onClose,
	expanded = false,
	onToggleExpand,
}: CardSearchPanelProps) {
	if (mode.kind === 'deck') {
		return (
			<DeckCardSearchPanel
				deckId={mode.deckId}
				onCardClick={mode.onCardClick}
				onClose={onClose}
				deckFormat={mode.deckFormat}
				commanderColorIdentity={mode.commanderColorIdentity}
				commanderName={mode.commanderName}
				onCollectionModeChange={mode.onCollectionModeChange}
				expanded={expanded}
				onToggleExpand={onToggleExpand}
			/>
		);
	}
	return (
		<PlainCardSearchPanel
			onCardClick={mode.onCardClick}
			buildCardMenuItems={mode.buildCardMenuItems}
			onClose={onClose}
			expanded={expanded}
			onToggleExpand={onToggleExpand}
		/>
	);
}
