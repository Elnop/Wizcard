import { getCardCollection } from '@/lib/scryfall/endpoints/cards';
import { BATCH_SIZE } from '@/lib/scryfall/constants';
import { getCardsFromCache, putCardsInCache } from '@/lib/scryfall/utils/card-cache';
import { hydrateAllParts } from '@/lib/scryfall/hydrateAllParts';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';

export interface ResolveProgress {
	/** Network batches completed so far. */
	current: number;
	/** Total network batches to fetch. */
	total: number;
}

export interface ResolveOptions {
	/**
	 * Returns true to abort. Checked after the cache read and before each network
	 * batch. When it returns true mid-flight, resolution stops and the partial
	 * map gathered so far is returned.
	 */
	isCancelled?: () => boolean;
	/** Called after each network batch completes. */
	onProgress?: (progress: ResolveProgress) => void;
	/** Skip the IndexedDB cache entirely (no read, no write). Default false. */
	skipCache?: boolean;
}

/**
 * Resolve a set of Scryfall print IDs into `ScryfallCard` objects.
 *
 * Pipeline: dedupe ids → read IndexedDB cache → batch-fetch the misses in
 * `BATCH_SIZE` chunks → write fetched cards back to cache. Per-batch network
 * failures are logged and skipped (never thrown). Returns a Map of every id
 * that resolved (cache hit OR network hit); unresolved ids are simply absent.
 */
export async function resolveCardsByScryfallIds(
	ids: string[],
	options: ResolveOptions = {}
): Promise<Map<string, ScryfallCard>> {
	const { isCancelled, onProgress, skipCache = false } = options;
	const uniqueIds = [...new Set(ids)];
	const resolved = new Map<string, ScryfallCard>();

	if (uniqueIds.length === 0) return resolved;

	let missIds = uniqueIds;

	if (!skipCache) {
		const cached = await getCardsFromCache(uniqueIds);
		if (isCancelled?.()) return resolved;
		for (const [id, card] of cached) {
			resolved.set(id, card);
		}
		missIds = uniqueIds.filter((id) => !cached.has(id));
	}

	if (missIds.length === 0) return resolved;

	const chunks: string[][] = [];
	for (let i = 0; i < missIds.length; i += BATCH_SIZE) {
		chunks.push(missIds.slice(i, i + BATCH_SIZE));
	}

	const fetched: ScryfallCard[] = [];
	for (let i = 0; i < chunks.length; i++) {
		if (isCancelled?.()) return resolved;
		try {
			const result = await getCardCollection(chunks[i].map((id) => ({ id })));
			for (const card of result.data) {
				fetched.push(card);
				resolved.set(card.id, card);
			}
		} catch (err) {
			console.error(`[resolveCardsByScryfallIds] batch ${i + 1}/${chunks.length} failed:`, err);
		}
		onProgress?.({ current: i + 1, total: chunks.length });
	}

	if (!skipCache && fetched.length > 0) {
		void putCardsInCache(fetched);
	}

	if (isCancelled?.()) return resolved;
	return hydrateResolvedMap(resolved);
}

/**
 * Hydrate `all_parts` on the localized cards of a resolved map and write the
 * enriched versions back to cache. Pure w.r.t. its injected deps so it can be
 * tested without IndexedDB. Failures inside `hydrateAllParts` are already
 * swallowed there; a cache-write failure is non-critical and ignored.
 */
export async function hydrateResolvedMap(
	resolved: Map<string, ScryfallCard>,
	deps: {
		fetchByOracleIds?: (oracleIds: string[]) => Promise<ScryfallCard[]>;
		writeCache?: (cards: ScryfallCard[]) => Promise<void>;
	} = {}
): Promise<Map<string, ScryfallCard>> {
	const writeCache = deps.writeCache ?? putCardsInCache;
	const cards = [...resolved.values()];
	const hydrated = await hydrateAllParts(cards, { fetchByOracleIds: deps.fetchByOracleIds });

	const changed: ScryfallCard[] = [];
	for (let i = 0; i < cards.length; i++) {
		if (hydrated[i] !== cards[i]) {
			resolved.set(hydrated[i].id, hydrated[i]);
			changed.push(hydrated[i]);
		}
	}
	if (changed.length > 0) void writeCache(changed);
	return resolved;
}
