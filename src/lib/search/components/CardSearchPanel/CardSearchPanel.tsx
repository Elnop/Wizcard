'use client';
import { DeckCardSearchPanel } from './DeckCardSearchPanel';
import type { ScryfallCard, ScryfallColor } from '@/lib/scryfall/types/scryfall';
import type { DeckFormat } from '@/types/decks';

type Props = {
	deckId: string;
	onCardClick: (card: ScryfallCard) => void;
	onClose: () => void;
	deckFormat?: DeckFormat | null;
	commanderColorIdentity?: ScryfallColor[];
	commanderName?: string | null;
	onCollectionModeChange?: (inCollectionOnly: boolean) => void;
	expanded?: boolean;
	onToggleExpand?: () => void;
};

// Temporary pass-through to the deck panel; the mode dispatcher lands in Task 3.
export function CardSearchPanel({ expanded = false, ...props }: Props) {
	return <DeckCardSearchPanel {...props} expanded={expanded} />;
}
