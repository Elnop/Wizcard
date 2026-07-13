import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo/site';
import { routing } from '@/i18n/routing';

/**
 * Toutes les routes sont désormais préfixées par la locale (`/fr/…`, `/en/…`),
 * donc les chemins owner-only à exclure existent sous chaque préfixe. On génère
 * le disallow pour les deux locales (settings/profile sont eux aussi privés).
 * `/api/` et `/auth/` sont exclus quel que soit le préfixe.
 */
const PRIVATE_SEGMENTS = ['collection', 'wishlist', 'profile', 'settings', 'auth'];

export default function robots(): MetadataRoute.Robots {
	const disallow = [
		'/api/',
		...routing.locales.flatMap((l) => PRIVATE_SEGMENTS.map((seg) => `/${l}/${seg}`)),
	];

	return {
		rules: {
			userAgent: '*',
			allow: '/',
			disallow,
		},
		sitemap: `${SITE_URL}/sitemap.xml`,
		host: SITE_URL,
	};
}
