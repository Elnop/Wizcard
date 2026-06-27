import type { ImageLoaderProps } from 'next/image';

const SCRYFALL_IMAGE_HOST = 'cards.scryfall.io';

/**
 * Returns true for Scryfall-hosted image URLs.
 *
 * Scryfall (behind Cloudflare) rejects requests whose User-Agent is a default
 * value supplied by an HTTP library (subcode `generic_user_agent`). Next.js's
 * image optimizer fetches upstream images with Node/undici's default UA and
 * offers no way to override that header, so every *uncached* Scryfall image is
 * answered with a 400 and the optimizer reports
 * "upstream response is invalid".
 */
export function isScryfallImageUrl(src: string): boolean {
	return src.includes(SCRYFALL_IMAGE_HOST);
}

/**
 * `next/image` loader for Scryfall card images.
 *
 * Scryfall already serves dedicated size variants (small/normal/large), and
 * those URLs are selected upstream before they reach <Image>. We therefore
 * bypass the Next.js optimizer and return the Scryfall URL unchanged so the
 * browser fetches it directly — browsers send a real User-Agent, which
 * Scryfall accepts. Non-Scryfall URLs fall back to the default optimizer.
 */
export function scryfallImageLoader({ src, width, quality }: ImageLoaderProps): string {
	if (isScryfallImageUrl(src)) {
		return src;
	}
	// Mirror Next.js's default optimizer URL for any non-Scryfall src.
	const params = new URLSearchParams({ url: src, w: String(width), q: String(quality ?? 75) });
	return `/_next/image?${params.toString()}`;
}
