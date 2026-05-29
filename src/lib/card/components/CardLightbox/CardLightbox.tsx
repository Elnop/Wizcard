'use client';

import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { CardImage } from '@/lib/card/components/CardImage/CardImage';
import styles from './CardLightbox.module.css';

interface Props {
	card: ScryfallCard;
	onClose: () => void;
}

export function CardLightbox({ card, onClose }: Props) {
	return (
		<div className={styles.lightbox} onClick={onClose}>
			<button
				type="button"
				onClick={onClose}
				aria-label="Fermer"
				style={{
					position: 'fixed',
					top: '16px',
					right: '16px',
					background: 'rgba(0,0,0,0.6)',
					border: '1px solid rgba(255,255,255,0.2)',
					borderRadius: '50%',
					width: '36px',
					height: '36px',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					cursor: 'pointer',
					color: '#fff',
					zIndex: 1201,
				}}
			>
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<path
						d="M2 2l12 12M14 2L2 14"
						stroke="currentColor"
						strokeWidth="1.8"
						strokeLinecap="round"
					/>
				</svg>
			</button>
			<div className={styles.lightboxCard} onClick={(e) => e.stopPropagation()}>
				<CardImage card={card} size="large" priority />
			</div>
		</div>
	);
}
