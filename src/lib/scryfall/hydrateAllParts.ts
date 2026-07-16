import { getCardCollection } from '@/lib/scryfall/endpoints/cards';
import { BATCH_SIZE } from '@/lib/scryfall/constants';
import { putCardsInCache } from '@/lib/scryfall/utils/card-cache';
import { isCustomCard, type CustomCard } from '@/lib/mpc/types';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';

/**
 * Non-English Scryfall prints omit `all_parts` (token/emblem relations live only
 * on the English oracle print). This fetches the oracle print by `oracle_id` and
 * grafts its `all_parts` onto the localized cards, leaving every other field
 * (image, printed_name, lang…) untouched. Cards that are English, already have
 * `all_parts`, or lack an `oracle_id` are returned unchanged.
 *
 * On network failure the input cards are returned as-is (no throw); the caller's
 * token detection degrades to "no tokens for this card", never worse than today.
 */
export async function hydrateAllParts(
	cards: ScryfallCard[],
	deps: { fetchByOracleIds?: (oracleIds: string[]) => Promise<ScryfallCard[]> } = {}
): Promise<ScryfallCard[]> {
	const fetchByOracleIds = deps.fetchByOracleIds ?? defaultFetchByOracleIds;

	const needsHydration = cards.filter(
		// Custom cards must never enter the Scryfall IndexedDB cache and never need
		// Scryfall all_parts hydration (token discovery works from the official card).
		(c) =>
			!isCustomCard(c as ScryfallCard | CustomCard) &&
			c.lang !== 'en' &&
			!c.all_parts &&
			Boolean(c.oracle_id)
	);
	if (needsHydration.length === 0) return cards;

	const oracleIds = [...new Set(needsHydration.map((c) => c.oracle_id))];

	let oracleCards: ScryfallCard[];
	try {
		oracleCards = await fetchByOracleIds(oracleIds);
	} catch (err) {
		console.warn('[hydrateAllParts] oracle fetch failed, leaving cards unhydrated:', err);
		return cards;
	}

	const partsByOracle = new Map<string, ScryfallCard['all_parts']>();
	for (const oc of oracleCards) {
		if (oc.oracle_id && oc.all_parts) partsByOracle.set(oc.oracle_id, oc.all_parts);
	}

	return cards.map((c) => {
		// Mirrors the needsHydration guard above: a custom card must never be
		// grafted with Scryfall all_parts, even if it shares an oracle_id with an
		// official card that was fetched in this batch.
		if (isCustomCard(c as ScryfallCard | CustomCard)) return c;
		if (c.lang === 'en' || c.all_parts || !c.oracle_id) return c;
		const parts = partsByOracle.get(c.oracle_id);
		return parts ? { ...c, all_parts: parts } : c;
	});
}

/**
 * On-demand wrapper around {@link hydrateAllParts}: hydrates the given cards and
 * writes the newly enriched ones back to the IndexedDB cache (so the next read
 * already has `all_parts`). Returns the hydrated array. Call this from the token
 * paths only — NOT from the shared resolver — so the oracle fetch fires solely
 * when token detection actually needs `all_parts`.
 *
 * Pure w.r.t. its injected deps for testing without IndexedDB; the cache write is
 * fire-and-forget (`putCardsInCache` swallows its own errors).
 */
export async function hydrateCardsAllParts<
	T extends {
		id: string;
		lang?: string;
		oracle_id?: string;
		all_parts?: ScryfallCard['all_parts'];
	},
>(
	cards: T[],
	deps: {
		fetchByOracleIds?: (oracleIds: string[]) => Promise<ScryfallCard[]>;
		writeCache?: (cards: ScryfallCard[]) => Promise<void>;
	} = {}
): Promise<T[]> {
	const writeCache = deps.writeCache ?? putCardsInCache;
	// hydrateAllParts reads only id/lang/oracle_id/all_parts and skips cards missing
	// oracle_id, so the wider deck-card union (custom cards included) is safe here.
	const hydrated = (await hydrateAllParts(cards as unknown as ScryfallCard[], {
		fetchByOracleIds: deps.fetchByOracleIds,
	})) as unknown as T[];

	const changed = hydrated.filter((card, i) => card !== cards[i]);
	if (changed.length > 0) void writeCache(changed as unknown as ScryfallCard[]);
	return hydrated;
}

async function defaultFetchByOracleIds(oracleIds: string[]): Promise<ScryfallCard[]> {
	const out: ScryfallCard[] = [];
	for (let i = 0; i < oracleIds.length; i += BATCH_SIZE) {
		const batch = oracleIds.slice(i, i + BATCH_SIZE);
		const result = await getCardCollection(batch.map((oracle_id) => ({ oracle_id })));
		out.push(...result.data);
	}
	return out;
}
