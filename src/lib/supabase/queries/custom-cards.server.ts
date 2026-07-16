import { createClient as createServerClient } from '@/lib/supabase/server';
import {
	type CustomCardRow,
	type CustomCardSourceRow,
	CUSTOM_CARD_SELECT,
	CUSTOM_CARD_SOURCE_SELECT,
} from './custom-cards';

export async function fetchCustomCardRowById(id: string): Promise<CustomCardRow | null> {
	const client = await createServerClient();
	const { data, error } = await client
		.from('custom_cards')
		.select(CUSTOM_CARD_SELECT)
		.eq('id', id)
		// Unmatched custom cards 404 even via direct URL, consistent with never being listed.
		.not('oracle_id', 'is', null)
		.single();
	if (error || !data) return null;
	return data as CustomCardRow;
}

export async function fetchCustomCardSourceRowById(
	sourceId: string
): Promise<CustomCardSourceRow | null> {
	const client = await createServerClient();
	const { data } = await client
		.from('custom_card_sources')
		.select(CUSTOM_CARD_SOURCE_SELECT)
		.eq('id', sourceId)
		.single();
	return (data as CustomCardSourceRow | null) ?? null;
}
