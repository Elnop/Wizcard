import { fetchLocalizedImage } from '@/lib/scryfall/hooks/useLocalizedImage';
import { getScryfallCardFaceImageUris } from '@/lib/scryfall/utils/scryfall-query';
import type { LocalizedImageCard } from '@/lib/scryfall/hooks/useLocalizedImage';

type ImageCard = LocalizedImageCard & {
	image_uris?: { small?: string; normal?: string; large?: string };
	card_faces?: Array<{ image_uris?: { small?: string; normal?: string; large?: string } }>;
};

/**
 * Non-hook equivalent of useCardImageUri, returning every face image the card
 * should contribute to the PDF: a single URL for normal cards, or two URLs
 * ([front, back]) for double-faced cards (transform, modal_dfc, double-faced
 * tokens, reversible). Each URL is localized to the card's language — or, when
 * the card has none, to `preferredLang` (the user's settings language) — when a
 * localized print is available, falling back per-URL to the card's default
 * (English) image.
 *
 * Delegates the cache/fetch/404 logic to fetchLocalizedImage, which goes
 * through the shared Scryfall throttle — so PDF export never duplicates that
 * logic nor bypasses rate limiting.
 */
export async function resolveLocalizedImageUris(
	card: ImageCard,
	size: 'small' | 'normal' | 'large' = 'normal',
	preferredLang?: string
): Promise<string[]> {
	const fallback = getScryfallCardFaceImageUris(card, size);
	const localized = await fetchLocalizedImage(card, undefined, preferredLang);
	if (!localized) return fallback;
	const localizedUris = getScryfallCardFaceImageUris(localized, size);
	// Align with the fallback: keep the same number of faces as the source card,
	// substituting the localized URL per face when present.
	return fallback.map((fallbackUri, i) => localizedUris[i] || fallbackUri);
}

/**
 * Single-URL resolver kept for callers that only need the front face.
 * Returns the first face URL from resolveLocalizedImageUris.
 */
export async function resolveLocalizedImageUri(
	card: ImageCard,
	size: 'small' | 'normal' | 'large' = 'normal',
	preferredLang?: string
): Promise<string> {
	return (await resolveLocalizedImageUris(card, size, preferredLang))[0] ?? '';
}
