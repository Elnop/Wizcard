import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo/site';
import { createClient } from '@/lib/supabase/server';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const staticRoutes: MetadataRoute.Sitemap = [
		{ url: `${SITE_URL}/`, changeFrequency: 'weekly', priority: 1 },
		{ url: `${SITE_URL}/search`, changeFrequency: 'weekly', priority: 0.8 },
		{ url: `${SITE_URL}/sets`, changeFrequency: 'monthly', priority: 0.6 },
		{ url: `${SITE_URL}/mentions-legales`, changeFrequency: 'yearly', priority: 0.2 },
		{ url: `${SITE_URL}/confidentialite`, changeFrequency: 'yearly', priority: 0.2 },
		{ url: `${SITE_URL}/cgu`, changeFrequency: 'yearly', priority: 0.2 },
	];

	try {
		const supabase = await createClient();
		const [decks, profiles] = await Promise.all([
			supabase.from('decks').select('id, updated_at'),
			supabase.from('profiles').select('nickname, updated_at'),
		]);

		const deckRoutes: MetadataRoute.Sitemap = (decks.data ?? []).map((d) => ({
			url: `${SITE_URL}/decks/${d.id}`,
			lastModified: d.updated_at ? new Date(d.updated_at as string) : undefined,
			changeFrequency: 'weekly',
			priority: 0.7,
		}));

		const profileRoutes: MetadataRoute.Sitemap = (profiles.data ?? [])
			.filter((p) => p.nickname)
			.map((p) => ({
				url: `${SITE_URL}/users/${encodeURIComponent(p.nickname as string)}`,
				lastModified: p.updated_at ? new Date(p.updated_at as string) : undefined,
				changeFrequency: 'weekly',
				priority: 0.6,
			}));

		return [...staticRoutes, ...deckRoutes, ...profileRoutes];
	} catch {
		return staticRoutes;
	}
}
