import { defineRouting } from 'next-intl/routing';

/**
 * Source unique du routing i18n. Les locales sont TOUJOURS préfixées dans
 * l'URL (`/fr/...`, `/en/...`) ; `/` fait un 307 vers la locale par défaut.
 * Choix dicté par le SEO/GEO : hreflang symétrique + contenu localisé rendu
 * côté serveur. `fr` est la locale par défaut (cible francophone, cohérent
 * avec la colonne DB `profiles.language default 'fr'`).
 */
export const routing = defineRouting({
	locales: ['fr', 'en'],
	defaultLocale: 'fr',
	localePrefix: 'always',
});

export type Locale = (typeof routing.locales)[number];
