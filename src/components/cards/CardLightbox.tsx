'use client';

import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { CardImage } from './CardImage';
import styles from '@/lib/collection/styles/lightbox.module.css';

interface Props {
	card: ScryfallCard;
	onClose: () => void;
}

export function CardLightbox({ card, onClose }: Props) {
	return (
		<div className={styles.lightbox} onClick={onClose}>
			<div className={styles.lightboxCard} onClick={(e) => e.stopPropagation()}>
				<CardImage card={card} size="large" priority />
			</div>
		</div>
	);
}
