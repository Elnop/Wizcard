'use client';

import { useLocalizedImage } from './useLocalizedImage';
import { getScryfallCardFaceImageUris } from '@/lib/scryfall/utils/scryfall-query';

type ImageCard = {
	set?: string;
	collector_number?: string;
	language?: string;
	entry?: { language?: string };
	image_uris?: { small?: string; normal?: string; large?: string; art_crop?: string };
	card_faces?: Array<{
		image_uris?: { small?: string; normal?: string; large?: string; art_crop?: string };
	}>;
};

function resolveUri(card: ImageCard, size: 'small' | 'normal' | 'large' | 'art_crop'): string {
	return card.image_uris?.[size] ?? card.card_faces?.[0]?.image_uris?.[size] ?? '';
}

export function useCardImageUri(
	card: ImageCard,
	size: 'small' | 'normal' | 'large' | 'art_crop',
	enabled: boolean
): { uri: string; loading: boolean; localized: boolean } {
	const { localized, loading } = useLocalizedImage(card, enabled);
	const effectiveCard = localized ? { ...card, ...localized } : card;
	return { uri: resolveUri(effectiveCard, size), loading, localized: !!localized };
}

/**
 * Hook variant returning every face image a card contributes: a single URL for
 * normal cards, or [front, back] for double-faced cards. Uses the same
 * getScryfallCardFaceImageUris logic as the PDF export (resolveLocalizedImageUris),
 * so the PDF settings preview can deploy DFC faces exactly like the generated PDF.
 */
export function useCardFaceImageUris(
	card: ImageCard,
	size: 'small' | 'normal' | 'large',
	enabled: boolean
): { uris: string[]; loading: boolean } {
	const { localized, loading } = useLocalizedImage(card, enabled);
	const effectiveCard = localized ? { ...card, ...localized } : card;
	return { uris: getScryfallCardFaceImageUris(effectiveCard, size), loading };
}
