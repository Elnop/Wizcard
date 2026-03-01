'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { getCardImageUriBySize } from '@/lib/utils/scryfall-query';
import styles from './CardImage.module.css';

export interface CardImageProps {
	card: ScryfallCard;
	size?: 'small' | 'normal' | 'large';
	priority?: boolean;
	className?: string;
	onClick?: () => void;
}

const sizeMap = {
	small: { width: 146, height: 204 },
	normal: { width: 488, height: 680 },
	large: { width: 672, height: 936 },
};

export function CardImage({
	card,
	size = 'normal',
	priority = false,
	className,
	onClick,
}: CardImageProps) {
	const [currentFace, setCurrentFace] = useState(0);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState(false);

	const isDoubleFaced =
		card.card_faces && card.card_faces.length > 1 && card.card_faces[0].image_uris;
	const imageUri = isDoubleFaced
		? (card.card_faces![currentFace].image_uris?.[size] ?? '')
		: getCardImageUriBySize(card, size);

	const { width, height } = sizeMap[size];

	const handleFlip = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (isDoubleFaced) {
			setCurrentFace((prev) => (prev === 0 ? 1 : 0));
		}
	};

	const classNames = [styles.container, onClick ? styles.clickable : '', className ?? '']
		.filter(Boolean)
		.join(' ');

	return (
		<div className={classNames} onClick={onClick}>
			<div className={styles.imageWrapper}>
				{!error && imageUri ? (
					<Image
						src={imageUri}
						alt={card.name}
						width={width}
						height={height}
						priority={priority}
						className={`${styles.image} ${isLoading ? styles.loading : ''}`}
						onLoad={() => setIsLoading(false)}
						onError={() => setError(true)}
					/>
				) : (
					<div className={styles.placeholder} style={{ width, height }}>
						<span className={styles.placeholderText}>{card.name}</span>
					</div>
				)}
				{isLoading && !error && <div className={styles.skeleton} style={{ width, height }} />}
			</div>
			{isDoubleFaced && (
				<button
					className={styles.flipButton}
					onClick={handleFlip}
					aria-label="Flip card"
					type="button"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
						<path d="M3 3v5h5" />
					</svg>
				</button>
			)}
		</div>
	);
}
