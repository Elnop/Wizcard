import { useCallback, useMemo } from 'react';
import { ContextMenu } from '@/components/ContextMenu/ContextMenu';
import type { ContextMenuAction } from '@/components/ContextMenu/ContextMenu';
import { useDeckContext } from '@/lib/deck/context/DeckContext';
import { findFreeCollectionCopy } from '@/lib/deck/utils/collectionCopyResolver';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { DeckFormat, DeckZone } from '@/types/decks';
import type { CardEntry } from '@/types/cards';

const COMMANDER_FORMATS: DeckFormat[] = ['commander', 'brawl', 'oathbreaker'];

type Props = {
	card: ScryfallCard;
	position: { x: number; y: number };
	deckId: string;
	format: DeckFormat | null | undefined;
	onCardClick: (card: ScryfallCard) => void;
	onClose: () => void;
	inCollectionOnly: boolean;
	collectionEntries: Array<{ scryfallId: string; entry: CardEntry }>;
	scryfallIdToOracleId: Map<string, string>;
};

export function SearchCardContextMenu({
	card,
	position,
	deckId,
	format,
	onCardClick,
	onClose,
	inCollectionOnly,
	collectionEntries,
	scryfallIdToOracleId,
}: Props) {
	const { addCardToDeck, addCollectionCardToDeck } = useDeckContext();
	const isCommanderFormat = format != null && COMMANDER_FORMATS.includes(format);

	const addWithCollectionAssign = useCallback(
		(zone: DeckZone) => {
			if (inCollectionOnly) {
				const copy = findFreeCollectionCopy(
					card.id,
					card.oracle_id ?? '',
					collectionEntries,
					scryfallIdToOracleId
				);
				if (copy) {
					addCollectionCardToDeck(deckId, copy.rowId, zone);
				} else {
					// No free collection copy — don't add a ghost deck card
					onClose();
					return;
				}
				onClose();
				return;
			}
			addCardToDeck(deckId, card, zone);
			onClose();
		},
		[
			inCollectionOnly,
			card,
			collectionEntries,
			scryfallIdToOracleId,
			addCollectionCardToDeck,
			deckId,
			addCardToDeck,
			onClose,
		]
	);

	const items: ContextMenuAction[] = useMemo(() => {
		const zoneItems: ContextMenuAction[] = [
			{
				type: 'action',
				label: '+ Mainboard',
				onClick: () => addWithCollectionAssign('mainboard'),
			},
			{
				type: 'action',
				label: '+ Sideboard',
				onClick: () => addWithCollectionAssign('sideboard'),
			},
			...(isCommanderFormat
				? [
						{
							type: 'action' as const,
							label: '+ Commander',
							onClick: () => addWithCollectionAssign('commander'),
						},
					]
				: []),
			{
				type: 'action',
				label: '+ Maybeboard',
				onClick: () => addWithCollectionAssign('maybeboard'),
			},
		];

		return [
			{
				type: 'action',
				label: 'Ajouter au deck...',
				onClick: () => {
					onCardClick(card);
					onClose();
				},
			},
			{ type: 'divider' },
			...zoneItems,
		];
	}, [card, isCommanderFormat, addWithCollectionAssign, onCardClick, onClose]);

	return <ContextMenu items={items} position={position} onClose={onClose} />;
}
