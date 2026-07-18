import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Or de marque (= theme_color du manifest). */
export const LOGO_GOLD = '#c9a84c';
/** Fond sombre de marque (= background_color du manifest). */
export const LOGO_BG = '#0a0a0a';
/** Tagline courte pour l'image Open Graph. */
export const BRAND_TAGLINE =
	'Search every Magic: The Gathering card, build decks, and track your collection.';

/** Nom de font-family exposé aux rendus next/og. */
export const WHITE_ON_BLACK_FAMILY = 'White on Black';

/**
 * Charge la police de marque White on Black en buffer, prête pour l'option
 * `fonts` de `ImageResponse`. next/og ne lit pas les variables CSS de next/font,
 * il faut lui passer le buffer directement.
 */
export function loadWhiteOnBlack(): {
	name: string;
	data: Buffer;
	weight: 400;
	style: 'normal';
} {
	const data = readFileSync(join(process.cwd(), 'src/fonts/brand/white-on-black.ttf'));
	return { name: WHITE_ON_BLACK_FAMILY, data, weight: 400, style: 'normal' };
}
