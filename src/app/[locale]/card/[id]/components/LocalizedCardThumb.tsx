'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useCardImageUri } from '@/lib/scryfall/hooks/useCardImageUri';
import { isScryfallImageUrl, scryfallImageLoader } from '@/lib/scryfall/utils/scryfallImageLoader';
import { hasRealScan } from '@/lib/scryfall/types/scryfall';
import type { ScryfallImageStatus } from '@/lib/scryfall/types/scryfall';

type ThumbCard = {
	name: string;
	set: string;
	collector_number: string;
	language?: string;
	entry?: { language?: string };
	image_status?: ScryfallImageStatus;
	image_uris?: { small?: string; normal?: string; large?: string; art_crop?: string };
	card_faces?: Array<{
		image_uris?: { small?: string; normal?: string; large?: string; art_crop?: string };
	}>;
};

const sizeMap = {
	small: { width: 146, height: 204 },
	normal: { width: 488, height: 680 },
	large: { width: 672, height: 936 },
	art_crop: { width: 626, height: 457 },
};

interface LocalizedCardThumbProps {
	card: ThumbCard;
	size?: 'small' | 'normal' | 'large' | 'art_crop';
	width?: number;
	height?: number;
	className?: string;
	priority?: boolean;
}

export function LocalizedCardThumb({
	card,
	size = 'small',
	width,
	height,
	className,
	priority = false,
}: LocalizedCardThumbProps) {
	const [error, setError] = useState(false);
	const { uri: src, loading, localized } = useCardImageUri(card, size, true);
	const dims = sizeMap[size];
	const w = width ?? dims.width;
	const h = height ?? dims.height;

	// The card's own image is a placeholder ("Localized Image Not Available") or
	// missing — hide it rather than show the grey stand-in. A resolved localized
	// image is already filtered by fetchLocalizedImage, so it's always real.
	if (!localized && !hasRealScan(card.image_status)) return null;

	if (loading || !src || error) return null;

	return (
		<Image
			src={src}
			alt={card.name}
			width={w}
			height={h}
			loader={scryfallImageLoader}
			unoptimized={isScryfallImageUrl(src)}
			className={className}
			priority={priority}
			onError={() => setError(true)}
		/>
	);
}
