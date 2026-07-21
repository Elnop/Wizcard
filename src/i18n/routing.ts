import { defineRouting } from 'next-intl/routing';

/**
 * Source unique du routing i18n. Les locales sont TOUJOURS préfixées dans
 * l'URL (`/en/...`, `/fr/...`) ; `/` fait un 307 vers la locale résolue.
 * Choix dicté par le SEO/GEO : hreflang symétrique + contenu localisé rendu
 * côté serveur. `en` est la locale par défaut (cible internationale) ; `fr`
 * reste servi via la détection `Accept-Language` et le préfixe `/fr` explicite.
 * `localeDetection` est laissé à sa valeur par défaut (`true`) : un navigateur
 * préférant le français atterrit sur `/fr`, tous les autres sur `/en`.
 */
export const routing = defineRouting({
	locales: ['fr', 'en'],
	defaultLocale: 'en',
	localePrefix: 'always',
});

export type Locale = (typeof routing.locales)[number];
