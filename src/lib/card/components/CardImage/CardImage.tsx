'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { getScryfallCardImageUriBySize } from '@/lib/scryfall/utils/scryfall-query';
import { isScryfallImageUrl, scryfallImageLoader } from '@/lib/scryfall/utils/scryfallImageLoader';
import { useLocalizedImage } from '@/lib/scryfall/hooks/useLocalizedImage';
import { isCustomCard } from '@/lib/mpc/types';
import type { CustomCard } from '@/lib/mpc/types';
import styles from './CardImage.module.css';

type CardImageCard = {
	name: string;
	set?: string;
	collector_number?: string;
	language?: string;
	entry?: { language?: string };
	image_uris?: { small?: string; normal?: string; large?: string };
	card_faces?: Array<{
		name?: string;
		image_uris?: { small?: string; normal?: string; large?: string };
	}>;
	object?: string;
	custom?: { image_url: string };
};

export interface CardImageProps {
	card: CardImageCard;
	size?: 'small' | 'normal' | 'large';
	priority?: boolean;
	className?: string;
	onClick?: () => void;
	isFoil?: boolean;
	foilType?: 'foil' | 'etched';
	isProxy?: boolean;
	disableTilt?: boolean;
}

const sizeMap = {
	small: { width: 146, height: 204 },
	normal: { width: 488, height: 680 },
	large: { width: 672, height: 936 },
};

const TILT_MAX_DEG = 10;

export function CardImage({
	card,
	size = 'normal',
	priority = false,
	className,
	onClick,
	isFoil = false,
	foilType = 'foil',
	isProxy = false,
	disableTilt = false,
}: CardImageProps) {
	const t = useTranslations('card');
	const [currentFace, setCurrentFace] = useState(0);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState(false);
	const [isVisible, setIsVisible] = useState(priority);
	const containerRef = useRef<HTMLDivElement>(null);
	const wrapperRef = useRef<HTMLDivElement>(null);
	const rectRef = useRef<DOMRect | null>(null);

	useEffect(() => {
		if (priority) return;
		const el = containerRef.current;
		if (!el) return;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) setIsVisible(true);
			},
			{ rootMargin: '200px' }
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [priority]);

	const isInputCustom = isCustomCard(card as unknown as CustomCard);
	const { localized, loading: localizedLoading } = useLocalizedImage(
		card as Parameters<typeof useLocalizedImage>[0],
		!isInputCustom && (priority || isVisible)
	);
	const effectiveCard = localized ? { ...card, ...localized } : card;

	const isCustom = isCustomCard(effectiveCard as unknown as CustomCard);
	const isDoubleFaced =
		!isCustom &&
		effectiveCard.card_faces &&
		effectiveCard.card_faces.length > 1 &&
		effectiveCard.card_faces[0].image_uris;

	let imageUri = '';
	if (isCustom) {
		imageUri = (effectiveCard as unknown as CustomCard).custom.image_url;
	} else if (isDoubleFaced) {
		imageUri = effectiveCard.card_faces![currentFace].image_uris?.[size] ?? '';
	} else {
		imageUri = getScryfallCardImageUriBySize(
			{
				image_uris: effectiveCard.image_uris,
				card_faces: effectiveCard.card_faces,
			},
			size
		);
	}

	const { width, height } = sizeMap[size];

	const handleFlip = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (isDoubleFaced) {
			setCurrentFace((prev) => (prev === 0 ? 1 : 0));
		}
	};

	const handleMouseEnter = () => {
		const el = wrapperRef.current;
		if (!el) return;
		rectRef.current = el.getBoundingClientRect();
		el.style.setProperty('--tilt-duration', '0ms');
	};

	const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
		const el = wrapperRef.current;
		const rect = rectRef.current;
		if (!el || !rect) return;
		const x = (e.clientX - rect.left) / rect.width;
		const y = (e.clientY - rect.top) / rect.height;
		const tiltX = (x - 0.5) * 2 * TILT_MAX_DEG;
		const tiltY = (0.5 - y) * 2 * TILT_MAX_DEG;
		el.style.setProperty('--tilt-x', `${tiltX}deg`);
		el.style.setProperty('--tilt-y', `${tiltY}deg`);
		el.style.setProperty('--mouse-x', `${x * 100}%`);
		el.style.setProperty('--mouse-y', `${y * 100}%`);
	};

	const handleMouseLeave = () => {
		const el = wrapperRef.current;
		if (!el) return;
		rectRef.current = null;
		el.style.setProperty('--tilt-duration', '500ms');
		el.style.setProperty('--tilt-x', '0deg');
		el.style.setProperty('--tilt-y', '0deg');
		el.style.setProperty('--mouse-x', '50%');
		el.style.setProperty('--mouse-y', '50%');
	};

	const classNames = [styles.container, onClick ? styles.clickable : '', className ?? '']
		.filter(Boolean)
		.join(' ');

	function renderCardImage() {
		if (localizedLoading) return <div className={styles.localizedPlaceholder} />;
		if (!error && imageUri) {
			return (
				<Image
					src={imageUri}
					alt={card.name}
					width={width}
					height={height}
					loader={scryfallImageLoader}
					unoptimized={isScryfallImageUrl(imageUri)}
					priority={priority}
					className={[styles.image, isLoading ? styles.loading : ''].filter(Boolean).join(' ')}
					onLoad={() => setIsLoading(false)}
					onError={() => setError(true)}
				/>
			);
		}
		return (
			<div className={styles.placeholder}>
				<span className={styles.placeholderText}>{card.name}</span>
			</div>
		);
	}

	return (
		<div ref={containerRef} className={classNames} onClick={onClick}>
			<div
				ref={wrapperRef}
				className={[styles.imageWrapper, disableTilt ? styles.noTilt : '']
					.filter(Boolean)
					.join(' ')}
				onMouseEnter={disableTilt ? undefined : handleMouseEnter}
				onMouseMove={disableTilt ? undefined : handleMouseMove}
				onMouseLeave={disableTilt ? undefined : handleMouseLeave}
			>
				{renderCardImage()}
				{(isLoading || localizedLoading) && !error && <div className={styles.skeleton} />}
				{isFoil && (
					<div
						className={foilType === 'etched' ? styles.etchedOverlay : styles.foilOverlay}
						aria-hidden="true"
					/>
				)}
				{isProxy && <span className={styles.proxyBadge}>proxy</span>}
			</div>
			{isDoubleFaced && (
				<button
					className={styles.flipButton}
					onClick={handleFlip}
					aria-label={t('flipCard')}
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
