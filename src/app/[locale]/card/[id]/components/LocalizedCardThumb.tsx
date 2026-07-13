'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useCardImageUri } from '@/lib/scryfall/hooks/useCardImageUri';
import { isScryfallImageUrl, scryfallImageLoader } from '@/lib/scryfall/utils/scryfallImageLoader';

type ThumbCard = {
	name: string;
	set: string;
	collector_number: string;
	language?: string;
	entry?: { language?: string };
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
	const { uri: src, loading } = useCardImageUri(card, size, true);
	const dims = sizeMap[size];
	const w = width ?? dims.width;
	const h = height ?? dims.height;

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
