import { getCardCollection } from '@/lib/scryfall/endpoints/cards';
import { BATCH_SIZE } from '@/lib/scryfall/constants';
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
		(c) => c.lang !== 'en' && !c.all_parts && Boolean(c.oracle_id)
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
		if (c.lang === 'en' || c.all_parts || !c.oracle_id) return c;
		const parts = partsByOracle.get(c.oracle_id);
		return parts ? { ...c, all_parts: parts } : c;
	});
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
