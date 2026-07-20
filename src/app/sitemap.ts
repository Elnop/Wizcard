import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo/site';
import { routing } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/server';

/**
 * Sitemap multilingue. Chaque URL publique est émise pour les DEUX locales
 * (`/fr/…` et `/en/…`) avec ses annotations `alternates.languages` (hreflang
 * fr/en + x-default → locale par défaut), de sorte que Google associe les
 * versions localisées entre elles. Les pages owner-only (`/decks`, `/collection`,
 * `/wishlist`) sont volontairement absentes (noindex, non partageables).
 */

const { locales, defaultLocale } = routing;

/** Alternates hreflang pour un chemin sans préfixe de locale (ex. `search`). */
function languagesFor(path: string): Record<string, string> {
	const suffix = path ? `/${path}` : '';
	return Object.fromEntries([
		...locales.map((l) => [l, `${SITE_URL}/${l}${suffix}`]),
		['x-default', `${SITE_URL}/${defaultLocale}${suffix}`],
	]);
}

/** Une entrée de sitemap par locale pour un chemin donné, hreflang inclus. */
function localizedEntries(
	path: string,
	opts: Omit<MetadataRoute.Sitemap[number], 'url' | 'alternates'>
): MetadataRoute.Sitemap {
	const languages = languagesFor(path);
	const suffix = path ? `/${path}` : '';
	return locales.map((l) => ({
		url: `${SITE_URL}/${l}${suffix}`,
		alternates: { languages },
		...opts,
	}));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const staticRoutes: MetadataRoute.Sitemap = [
		...localizedEntries('', { changeFrequency: 'weekly', priority: 1 }),
		...localizedEntries('search', { changeFrequency: 'weekly', priority: 0.8 }),
		...localizedEntries('sets', { changeFrequency: 'monthly', priority: 0.6 }),
		...localizedEntries('mentions-legales', { changeFrequency: 'yearly', priority: 0.2 }),
		...localizedEntries('confidentialite', { changeFrequency: 'yearly', priority: 0.2 }),
		...localizedEntries('cgu', { changeFrequency: 'yearly', priority: 0.2 }),
	];

	try {
		const supabase = await createClient();
		// Only user decks belong in the sitemap. Importing ~3000 MTGJSON precons
		// made this query — which has no limit — return PostgREST's max_rows page
		// (1000, see supabase/config.toml) in arbitrary order, so precons crowded
		// out every real user deck and sitemap membership churned between builds.
		// Filtering to source='user' keeps the sitemap about user-generated content;
		// the explicit order + limit make it deterministic and bounded as that set
		// grows.
		const [decks, profiles] = await Promise.all([
			supabase
				.from('decks')
				.select('id, updated_at')
				.eq('source', 'user')
				.eq('is_public', true)
				.order('updated_at', { ascending: false })
				.limit(1000),
			supabase.from('profiles').select('nickname, updated_at'),
		]);

		const deckRoutes: MetadataRoute.Sitemap = (decks.data ?? []).flatMap((d) =>
			localizedEntries(`decks/${d.id}`, {
				lastModified: d.updated_at ? new Date(d.updated_at as string) : undefined,
				changeFrequency: 'weekly',
				priority: 0.7,
			})
		);

		const profileRoutes: MetadataRoute.Sitemap = (profiles.data ?? [])
			.filter((p) => p.nickname)
			.flatMap((p) =>
				localizedEntries(`users/${encodeURIComponent(p.nickname as string)}`, {
					lastModified: p.updated_at ? new Date(p.updated_at as string) : undefined,
					changeFrequency: 'weekly',
					priority: 0.6,
				})
			);

		return [...staticRoutes, ...deckRoutes, ...profileRoutes];
	} catch {
		return staticRoutes;
	}
}
