import { useMemo } from 'react';
import { ContextMenu } from '@/components/ContextMenu/ContextMenu';
import type { ContextMenuAction } from '@/components/ContextMenu/ContextMenu';
import { useDeckContext } from '@/lib/deck/context/DeckContext';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { DeckFormat } from '@/types/decks';

const COMMANDER_FORMATS: DeckFormat[] = ['commander', 'brawl', 'oathbreaker'];

type Props = {
	card: ScryfallCard;
	position: { x: number; y: number };
	deckId: string;
	format: DeckFormat | null | undefined;
	onCardClick: (card: ScryfallCard) => void;
	onClose: () => void;
};

export function SearchCardContextMenu({
	card,
	position,
	deckId,
	format,
	onCardClick,
	onClose,
}: Props) {
	const { addCardToDeck } = useDeckContext();
	const isCommanderFormat = format != null && COMMANDER_FORMATS.includes(format);

	const items: ContextMenuAction[] = useMemo(() => {
		const zoneItems: ContextMenuAction[] = [
			{
				type: 'action',
				label: '+ Mainboard',
				onClick: () => {
					addCardToDeck(deckId, card, 'mainboard');
					onClose();
				},
			},
			{
				type: 'action',
				label: '+ Sideboard',
				onClick: () => {
					addCardToDeck(deckId, card, 'sideboard');
					onClose();
				},
			},
			...(isCommanderFormat
				? [
						{
							type: 'action' as const,
							label: '+ Commander',
							onClick: () => {
								addCardToDeck(deckId, card, 'commander');
								onClose();
							},
						},
					]
				: []),
			{
				type: 'action',
				label: '+ Maybeboard',
				onClick: () => {
					addCardToDeck(deckId, card, 'maybeboard');
					onClose();
				},
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
	}, [card, deckId, isCommanderFormat, addCardToDeck, onCardClick, onClose]);

	return <ContextMenu items={items} position={position} onClose={onClose} />;
}
