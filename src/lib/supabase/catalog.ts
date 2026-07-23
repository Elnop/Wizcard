// Cookieless anon Supabase client for reading the PUBLIC catalog (card_definitions,
// card_prints, card_definition_faces, card_print_faces, card_sets — all RLS public-read).
// Unlike @/lib/supabase/server, it never touches next/headers/cookies, so a route that
// reads the catalog through it can be statically generated (ISR). Never use it for
// user-scoped data.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

export function createCatalogClient(): SupabaseClient {
	if (!_client) {
		_client = createClient(
			process.env.NEXT_PUBLIC_SUPABASE_URL!,
			process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
			{ auth: { persistSession: false, autoRefreshToken: false } }
		);
	}
	return _client;
}
