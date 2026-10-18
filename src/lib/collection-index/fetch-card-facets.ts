import { createCatalogClient } from '@/lib/supabase/catalog';
import { isUuid } from '@/lib/card/catalog-db/uuid';
import { mapWithConcurrency } from '@/lib/async/map-with-concurrency';
import type { CardFacets } from '@/types/cards';
import { facetRowToFacets, type CardFacetsRow } from './facets';

// POST body, so no URL limit — but PostgREST silently truncates any response to
// `max_rows` (1000, supabase/config.toml), RPCs included. A larger chunk lost every
// row past 1000 and sent those prints down the slow per-card fallback.
const FACETS_CHUNK = 1000;
const FACETS_CONCURRENCY = 6;

/**
 * Facets for print ids from the `card_facets` RPC. Non-uuid ids are skipped (one
 * would make Postgres reject the whole uuid[] argument); ids absent from the
 * catalog are simply missing from the result. Throws if any call fails, so the
 * caller can tell "not in catalog" from "could not ask".
 */
export async function fetchCardFacets(ids: string[]): Promise<Map<string, CardFacets>> {
	const sb = createCatalogClient();
	const valid = [...new Set(ids)].filter(isUuid);
	const chunks: string[][] = [];
	for (let i = 0; i < valid.length; i += FACETS_CHUNK)
		chunks.push(valid.slice(i, i + FACETS_CHUNK));

	const out = new Map<string, CardFacets>();
	let failure: unknown = null;
	await mapWithConcurrency(chunks, FACETS_CONCURRENCY, async (chunk) => {
		const { data, error } = await sb.rpc('card_facets', { p_ids: chunk });
		if (error) {
			failure = error;
			return;
		}
		for (const row of (data ?? []) as CardFacetsRow[]) out.set(row.id, facetRowToFacets(row));
	});
	if (failure)
		throw new Error(`[card_facets] RPC failed: ${String((failure as Error).message ?? failure)}`);
	return out;
}
