import type { Metadata } from 'next';
import { routing } from '@/i18n/routing';
import type { Locale } from '@/i18n/routing';

/**
 * Construit le bloc `alternates` (canonical + hreflang) d'une page localisée.
 *
 * - `canonical` pointe sur l'URL **de cette page dans la locale courante**
 *   (préfixée), pas sur la racine — sinon chaque page se déclare canoniquement
 *   comme la home (`/fr`), ce qui casse l'indexation par-page.
 * - `languages` liste les deux locales + `x-default` (→ locale par défaut),
 *   pour un hreflang symétrique attendu par Google/GEO.
 *
 * `path` est le chemin SANS préfixe de locale et SANS slash initial
 * (ex. `decks/abc123`, `search`, `''` pour la home). Les URLs sont relatives à
 * `metadataBase` (défini dans le layout racine).
 */
export function buildAlternates(locale: Locale, path = ''): Metadata['alternates'] {
	const clean = path.replace(/^\/+/, '');
	const suffix = clean ? `/${clean}` : '';
	const languages = Object.fromEntries([
		...routing.locales.map((l) => [l, `/${l}${suffix}`]),
		['x-default', `/${routing.defaultLocale}${suffix}`],
	]);
	return {
		canonical: `/${locale}${suffix}`,
		languages,
	};
}
