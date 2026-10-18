import type { CardImageStatus } from '@/types/cards';

/**
 * Full-card render sizes Scryfall serves, smallest first, with their pixel width
 * (measured on cards.scryfall.io: 146x204, 488x680, 672x936, 744x1040). `png` is
 * the highest resolution Scryfall publishes — nothing larger exists.
 */
export const CARD_IMAGE_TIERS = ['small', 'normal', 'large', 'png'] as const;
export type CardImageTier = (typeof CARD_IMAGE_TIERS)[number];

export const CARD_IMAGE_TIER_WIDTH: Record<CardImageTier, number> = {
	small: 146,
	normal: 488,
	large: 672,
	png: 744,
};

export function tierRank(tier: CardImageTier): number {
	return CARD_IMAGE_TIERS.indexOf(tier);
}

export function maxTier(a: CardImageTier, b: CardImageTier): CardImageTier {
	return tierRank(a) >= tierRank(b) ? a : b;
}

export function minTier(a: CardImageTier, b: CardImageTier): CardImageTier {
	return tierRank(a) <= tierRank(b) ? a : b;
}

/** Smallest tier whose source is at least `devicePixels` wide (the largest one past that). */
export function tierForDevicePixels(devicePixels: number): CardImageTier {
	return (
		CARD_IMAGE_TIERS.find((t) => CARD_IMAGE_TIER_WIDTH[t] >= devicePixels) ??
		CARD_IMAGE_TIERS[CARD_IMAGE_TIERS.length - 1]
	);
}

const SCRYFALL_IMAGE_HOST = 'cards.scryfall.io';

/** Size segments Scryfall serves; the one we rewrite sits right after the host. */
const SIZE_SEGMENTS = ['small', 'normal', 'large', 'png', 'border_crop', 'art_crop'];

/**
 * Rewrite a Scryfall image URL to another size of the same print.
 *
 * Scryfall serves every size from the same path with only the leading size
 * segment changing (and the extension, `.png` for `png`):
 *   https://cards.scryfall.io/large/front/7/6/<id>.jpg?<ts>
 *   https://cards.scryfall.io/png/front/7/6/<id>.png?<ts>
 *
 * That layout is a Scryfall implementation detail, not a documented contract:
 * use this only as a fallback when the stored `image_uris` lacks the size, and
 * keep a stored size to fall back on. Returns null for any non-Scryfall URL.
 */
export function deriveScryfallImageUrl(
	imageUrl: string | null | undefined,
	target: 'png' | 'art_crop'
): string | null {
	if (!imageUrl) return null;

	let url: URL;
	try {
		url = new URL(imageUrl);
	} catch {
		return null;
	}

	// Only rewrite URLs we recognise. Anything else (a custom/MPC image, a
	// user-supplied cover) is never mangled here.
	if (url.hostname !== SCRYFALL_IMAGE_HOST) return null;

	const segments = url.pathname.split('/').filter(Boolean);
	if (segments.length === 0) return null;

	const [size, ...rest] = segments;
	if (size === target) return imageUrl;
	if (!SIZE_SEGMENTS.includes(size)) return null;

	const ext = target === 'png' ? 'png' : 'jpg';
	const file = rest.pop();
	if (!file) return null;
	// Keep the query string: it is Scryfall's cache-busting timestamp, and every
	// size is published under the same one.
	const renamed = file.replace(/\.[a-z]+$/i, '.' + ext);
	url.pathname = `/${[target, ...rest, renamed].join('/')}`;
	return url.toString();
}

type TieredImageUris = { small?: string; normal?: string; large?: string; png?: string };

/**
 * URL for `tier`, stepping down to the next stored size when it is absent.
 *
 * `png` is only worth serving for a high-resolution scan (on a low-res scan it
 * is an upscale of the same pixels, at ~7x the bytes of `large`). The catalog
 * seed stores `png`, but rows written before that change don't carry it, so it is
 * derived from `large` until the catalog is re-seeded.
 */
export function pickTieredImageUri(
	uris: TieredImageUris | undefined,
	tier: CardImageTier,
	imageStatus: CardImageStatus | undefined
): string {
	if (!uris) return '';
	if (tier === 'png') {
		if (imageStatus === 'highres_scan') {
			const png = uris.png ?? deriveScryfallImageUrl(uris.large, 'png');
			if (png) return png;
		}
		tier = 'large';
	}
	for (let i = tierRank(tier); i >= 0; i--) {
		const uri = uris[CARD_IMAGE_TIERS[i]];
		if (uri) return uri;
	}
	return '';
}
