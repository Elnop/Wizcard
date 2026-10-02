'use client';
import { DeckCardSearchPanel } from './DeckCardSearchPanel';
import { PlainCardSearchPanel } from './PlainCardSearchPanel';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import type { ContextMenuAction } from '@/components/ContextMenu/ContextMenu';
import type { Card, MtgColor } from '@/types/cards';
import type { DeckFormat } from '@/types/decks';

export type PanelMode =
	| {
			kind: 'deck';
			deckId: string;
			deckFormat?: DeckFormat | null;
			commanderColorIdentity?: MtgColor[];
			commanderName?: string | null;
			onCardClick: (card: Card) => void;
			onCollectionModeChange?: (inCollectionOnly: boolean) => void;
	  }
	| {
			kind: 'collection' | 'wishlist';
			onCardClick: (card: AnyCard) => void;
			buildCardMenuItems: (card: AnyCard, close: () => void) => ContextMenuAction[];
	  }
	/**
	 * Studio : choisir une carte dont on repart pour en dessiner une nouvelle.
	 *
	 * Variante à part plutôt que `collection` réutilisée : cliquer ne consulte
	 * pas une carte, il ÉCRASE le brouillon en cours. Et il n'y a pas de menu
	 * contextuel — aucune des actions de la collection (ajouter, souhaiter) n'a
	 * de sens dans l'éditeur.
	 */
	| {
			kind: 'studio';
			onCardClick: (card: AnyCard) => void;
	  };

export type CardSearchPanelProps = {
	mode: PanelMode;
	onClose: () => void;
	expanded?: boolean;
	onToggleExpand?: () => void;
};

/** Studio mode has no context menu; declared once so the array identity is stable. */
const noCardMenuItems = (): ContextMenuAction[] => [];

/**
 * Fixed side panel that searches Scryfall and adds cards. Deck mode keeps the
 * full deck behaviour (zones, EDHREC, legality, commander CI); collection,
 * wishlist and studio modes hide those and delegate the click to the caller.
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
			buildCardMenuItems={mode.kind === 'studio' ? noCardMenuItems : mode.buildCardMenuItems}
			onClose={onClose}
			expanded={expanded}
			onToggleExpand={onToggleExpand}
		/>
	);
}
