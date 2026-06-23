import { fetchLocalizedImage } from '@/lib/scryfall/hooks/useLocalizedImage';
import { getScryfallCardImageUriBySize } from '@/lib/scryfall/utils/scryfall-query';
import type { LocalizedImageCard } from '@/lib/scryfall/hooks/useLocalizedImage';

type ImageCard = LocalizedImageCard & {
	image_uris?: { small?: string; normal?: string; large?: string };
	card_faces?: Array<{ image_uris?: { small?: string; normal?: string; large?: string } }>;
};

/**
 * Non-hook equivalent of useCardImageUri: resolves the localized image URI for
 * a card (the same image the site cards display), falling back to the card's
 * default (English) image when no localization applies or the localized print
 * can't be fetched.
 *
 * Delegates the cache/fetch/404 logic to fetchLocalizedImage, which goes
 * through the shared Scryfall throttle — so PDF export never duplicates that
 * logic nor bypasses rate limiting.
 */
export async function resolveLocalizedImageUri(
	card: ImageCard,
	size: 'small' | 'normal' | 'large' = 'normal'
): Promise<string> {
	const fallback = getScryfallCardImageUriBySize(card, size);
	const localized = await fetchLocalizedImage(card);
	if (!localized) return fallback;
	return getScryfallCardImageUriBySize(localized, size) || fallback;
}
