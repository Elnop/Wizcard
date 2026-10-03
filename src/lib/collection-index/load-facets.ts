import { getCustomCardsByIds } from '@/lib/mpc/db/custom-cards';
import { resolveCardsByScryfallIds } from '@/lib/scryfall/resolveCardsByScryfallIds';
import { isUuid } from '@/lib/card/catalog-db/uuid';
import { isCustomCard } from '@/lib/mpc/types';
import type { IndexedCard } from '@/types/cards';
import { fetchCardFacets } from './fetch-card-facets';
import { facetsFromCard } from './facets';

export interface LoadFacetsResult {
	found: Map<string, IndexedCard>;
	notFound: string[];
}

/**
 * Facts the index needs for `ids`:
 *   mpc: ids        → custom_cards (full CustomCard, light and local)
 *   catalog prints  → card_facets RPC
 *   the rest        → resolveCardsByScryfallIds (catalog lag → Scryfall), facets
 *                     derived from the returned Card (which also lands in the cache)
 * An id nobody knows is reported in `notFound`. If the RPC itself failed and the
 * fallback could not cover its ids either, this throws: the index must not claim
 * `ready` with silent holes.
 */
export async function loadFacets(
	ids: string[],
	opts: { isCancelled?: () => boolean } = {}
): Promise<LoadFacetsResult> {
	const found = new Map<string, IndexedCard>();
	const unique = [...new Set(ids)];
	const customIds = unique.filter((id) => id.startsWith('mpc:'));
	const printIds = unique.filter((id) => !id.startsWith('mpc:'));

	if (customIds.length > 0) {
		try {
			for (const [id, card] of await getCustomCardsByIds(customIds)) found.set(id, card);
		} catch (err) {
			console.error('[loadFacets] custom cards failed:', err);
		}
	}
	if (opts.isCancelled?.()) return { found, notFound: [] };

	let rpcFailed = false;
	try {
		for (const [id, facets] of await fetchCardFacets(printIds)) found.set(id, facets);
	} catch (err) {
		rpcFailed = true;
		console.error('[loadFacets] card_facets failed, falling back:', err);
	}
	if (opts.isCancelled?.()) return { found, notFound: [] };

	// Non-uuid ids can't be in the catalog nor on Scryfall by id: not found.
	const malformed = printIds.filter((id) => !isUuid(id));
	const misses = printIds.filter((id) => isUuid(id) && !found.has(id));
	if (misses.length > 0) {
		const resolved = await resolveCardsByScryfallIds(misses, { isCancelled: opts.isCancelled });
		for (const [id, card] of resolved) {
			found.set(id, isCustomCard(card) ? card : facetsFromCard(card));
		}
	}
	const notFound = [...malformed, ...misses.filter((id) => !found.has(id))];
	if (rpcFailed && notFound.length > 0) {
		throw new Error(`[loadFacets] ${notFound.length} prints unresolved after card_facets failure`);
	}
	if (notFound.length > 0) {
		console.warn(`[loadFacets] ${notFound.length} prints found nowhere — excluded`, notFound);
	}
	return { found, notFound };
}
