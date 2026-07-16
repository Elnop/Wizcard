import { getCardCollection } from '@/lib/scryfall/endpoints/cards';
import { BATCH_SIZE } from '@/lib/scryfall/constants';
import { getCardsFromCache, putCardsInCache } from '@/lib/scryfall/utils/card-cache';
import { putCards } from '@/lib/scryfall/store/cards-store';
import { getCustomCardsByIds } from '@/lib/mpc/db/custom-cards';
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
 * Resolve `mpc:<uuid>` custom-card copy ids into the `resolved` map in place.
 * Custom cards NEVER enter the Scryfall IndexedDB cache — only mirrored into
 * the in-memory store, same as a Scryfall cache hit.
 */
async function resolveCustomCards(
	customIds: string[],
	resolved: Map<string, ScryfallCard>
): Promise<void> {
	if (customIds.length === 0) return;
	try {
		const customCards = await getCustomCardsByIds(customIds);
		for (const [id, card] of customCards) {
			resolved.set(id, card as unknown as ScryfallCard);
		}
		putCards([...customCards.values()] as unknown as ScryfallCard[]);
	} catch (err) {
		console.error('[resolveCardsByScryfallIds] custom-card batch failed:', err);
	}
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
	const allIds = [...new Set(ids)];
	const resolved = new Map<string, ScryfallCard>();

	if (allIds.length === 0) return resolved;

	// Custom-card copies are stored with an `mpc:<uuid>` id in the same column
	// as Scryfall ids. Route them to the custom_cards table; everything else
	// follows the Scryfall cache+API path unchanged.
	const customIds = allIds.filter((id) => id.startsWith('mpc:'));
	const uniqueIds = allIds.filter((id) => !id.startsWith('mpc:'));

	await resolveCustomCards(customIds, resolved);
	if (isCancelled?.()) return resolved;

	if (uniqueIds.length === 0) return resolved;

	let missIds = uniqueIds;

	if (!skipCache) {
		const cached = await getCardsFromCache(uniqueIds);
		if (isCancelled?.()) return resolved;
		for (const [id, card] of cached) {
			resolved.set(id, card);
		}
		// Mirror cache hits into the global in-memory store (synchronous reads).
		putCards([...cached.values()]);
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

	// Mirror network-fetched cards into the global in-memory store (cache hits
	// were already mirrored above). Covers the skipCache path too.
	putCards(fetched);

	return resolved;
}
