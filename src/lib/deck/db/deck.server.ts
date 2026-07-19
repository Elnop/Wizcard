import { createClient } from '@/lib/supabase/server';
import type { DeckMeta, DeckSource } from '@/types/decks';
import type { DeckFormat } from '@/types/decks';

/**
 * Server-side deck metadata fetch for generateMetadata / OG / sitemap. Uses the
 * SSR Supabase client (fetchDeckMetaById in deck/db uses the browser client and
 * is unusable in RSC). Public decks are readable by anon via RLS.
 */
export async function fetchDeckMetaServer(deckId: string): Promise<DeckMeta | null> {
	const supabase = await createClient();
	const { data, error } = await supabase
		.from('decks')
		.select(
			'id, owner_id, name, format, description, cover_art_url, source, is_public, created_at, updated_at'
		)
		.eq('id', deckId)
		.maybeSingle();
	if (error || !data) return null;
	return {
		id: data.id as string,
		ownerId: (data.owner_id ?? null) as string | null,
		name: data.name as string,
		format: (data.format ?? null) as DeckFormat | null,
		description: (data.description ?? null) as string | null,
		folderId: null,
		coverArtUrl: (data.cover_art_url ?? null) as string | null,
		source: (data.source === 'mtgjson' ? 'mtgjson' : 'user') as DeckSource,
		isPublic: (data.is_public ?? true) as boolean,
		createdAt: data.created_at as string,
		updatedAt: data.updated_at as string,
	};
}
