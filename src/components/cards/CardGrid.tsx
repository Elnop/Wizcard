import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { CardImage } from './CardImage';
import styles from './CardGrid.module.css';

export interface CardGridProps {
	cards: ScryfallCard[];
	onCardClick?: (card: ScryfallCard) => void;
	className?: string;
}

export function CardGrid({ cards, onCardClick, className }: CardGridProps) {
	const classNames = [styles.grid, className].filter(Boolean).join(' ');

	if (cards.length === 0) {
		return (
			<div className={styles.empty}>
				<p>No cards found</p>
			</div>
		);
	}

	return (
		<div className={classNames}>
			{cards.map((card) => (
				<div key={card.id} className={styles.item}>
					<CardImage
						card={card}
						size="normal"
						onClick={onCardClick ? () => onCardClick(card) : undefined}
					/>
					<p className={styles.cardName}>{card.name}</p>
				</div>
			))}
		</div>
	);
}
