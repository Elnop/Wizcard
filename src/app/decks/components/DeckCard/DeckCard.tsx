'use client';

import type { DeckMeta } from '@/types/decks';
import styles from './DeckCard.module.css';

type Props = {
	deck: DeckMeta;
	cardCount?: number;
	onClick: () => void;
	onDelete: () => void;
};

export function DeckCard({ deck, cardCount, onClick, onDelete }: Props) {
	return (
		<div
			role="button"
			tabIndex={0}
			className={styles.card}
			onClick={onClick}
			onKeyDown={(e) => {
				if (e.key === 'Enter') onClick();
			}}
		>
			<div className={styles.header}>
				<h3 className={styles.name}>{deck.name}</h3>
				<button
					type="button"
					className={styles.deleteBtn}
					onClick={(e) => {
						e.stopPropagation();
						onDelete();
					}}
					aria-label="Delete deck"
				>
					&times;
				</button>
			</div>
			{deck.format && <span className={styles.format}>{deck.format}</span>}
			{deck.description && <p className={styles.description}>{deck.description}</p>}
			<div className={styles.footer}>
				<span className={styles.count}>
					{cardCount ?? 0} card{cardCount !== 1 ? 's' : ''}
				</span>
			</div>
		</div>
	);
}
