import { createCatalogClient } from '@/lib/supabase/catalog';

/**
 * Raw Supabase access for the `card_sets` lookups of article pages. Returns DB rows;
 * callers map them. Cookieless catalog client, so the article pages stay ISR.
 */

export interface CardSetLinkRow {
	code: string;
	name: string;
	icon_svg_uri: string | null;
}

/** The sets with these codes (one request); unknown codes are simply absent. */
export async function fetchSetsByCodes(codes: string[]): Promise<CardSetLinkRow[]> {
	if (codes.length === 0) return [];
	const client = createCatalogClient();
	const { data, error } = await client
		.from('card_sets')
		.select('code, name, icon_svg_uri')
		.in('code', codes);
	if (error) throw new Error(`fetchSetsByCodes: ${error.message}`);
	return (data ?? []) as CardSetLinkRow[];
}
