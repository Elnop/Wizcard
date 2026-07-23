// DB-first card retrieval with Scryfall fallback. Same signatures as the Scryfall
// endpoints so a consumer swaps its import and nothing else. The fallback lives HERE;
// catalog-db knows nothing about Scryfall.

import * as db from '@/lib/card/catalog-db';
import * as scry from '@/lib/scryfall/endpoints/cards';
import type {
	ScryfallCard,
	ScryfallCardIdentifier,
	ScryfallList,
} from '@/lib/scryfall/types/scryfall';

export async function getCardById(id: string): Promise<ScryfallCard> {
	return (await db.byId(id)) ?? scry.getCardById(id);
}

export async function getCardBySetNumber(set: string, n: string): Promise<ScryfallCard> {
	return (await db.bySetNumber(set, n)) ?? scry.getCardBySetNumber(set, n);
}

export async function getCardBySetNumberAndLang(
	set: string,
	n: string,
	lang: string,
	signal?: AbortSignal
): Promise<ScryfallCard> {
	return (
		(await db.bySetNumberLang(set, n, lang)) ?? scry.getCardBySetNumberAndLang(set, n, lang, signal)
	);
}

export async function getCardByName(name: string, opts?: { lang?: string }): Promise<ScryfallCard> {
	return (await db.byName(name, opts)) ?? scry.getCardByName(name);
}

export async function getCardByMultiverseId(id: number): Promise<ScryfallCard> {
	return (await db.byMultiverseId(id)) ?? scry.getCardByMultiverseId(id);
}
export async function getCardByMtgoId(id: number): Promise<ScryfallCard> {
	return (await db.byMtgoId(id)) ?? scry.getCardByMtgoId(id);
}
export async function getCardByArenaId(id: number): Promise<ScryfallCard> {
	return (await db.byArenaId(id)) ?? scry.getCardByArenaId(id);
}
export async function getCardByTcgplayerId(id: number): Promise<ScryfallCard> {
	return (await db.byTcgplayerId(id)) ?? scry.getCardByTcgplayerId(id);
}
export async function getCardByCardmarketId(id: number): Promise<ScryfallCard> {
	return (await db.byCardmarketId(id)) ?? scry.getCardByCardmarketId(id);
}

// Collection: resolve id-identifiers from the DB, fall back to ONE batched Scryfall call
// for the misses (identifiers with no `id`, or an `id` not present in the catalog), then
// merge in input order. Matches scry.getCardCollection's ScryfallList<ScryfallCard> shape
// (some callers read `.data`, one reads `.not_found`) so this is a true drop-in.
export async function getCardCollection(
	identifiers: ScryfallCardIdentifier[]
): Promise<ScryfallList<ScryfallCard>> {
	const dbResults = await db.byCollection(identifiers);

	const missIdentifiers: ScryfallCardIdentifier[] = [];
	identifiers.forEach((identifier, i) => {
		if (!dbResults[i]) missIdentifiers.push(identifier);
	});

	const fallback =
		missIdentifiers.length > 0 ? await scry.getCardCollection(missIdentifiers) : null;

	// Scryfall returns `data` in the same order as the request, just skipping any identifiers
	// it couldn't resolve (those land in `not_found` instead). So walk `missIdentifiers` and
	// `fallback.data` in lockstep: each identifier consumes the next fallback card UNLESS it's
	// one of the reported not_found ones, in which case it's dropped and nothing is consumed.
	const notFoundKeys = new Set(
		(fallback?.not_found ?? []).map((identifier) => JSON.stringify(identifier))
	);
	const fallbackById = new Map<string, ScryfallCard>();
	let fallbackIndex = 0;
	for (const identifier of missIdentifiers) {
		if (notFoundKeys.has(JSON.stringify(identifier))) continue;
		const card = fallback!.data[fallbackIndex++];
		if (card) fallbackById.set(JSON.stringify(identifier), card);
	}

	const data: ScryfallCard[] = [];
	const notFoundOut: ScryfallCardIdentifier[] = [];
	identifiers.forEach((identifier, i) => {
		const dbCard = dbResults[i];
		if (dbCard) {
			data.push(dbCard);
			return;
		}
		const card = fallbackById.get(JSON.stringify(identifier));
		if (card) {
			data.push(card);
		} else {
			notFoundOut.push(identifier);
		}
	});

	return {
		object: 'list',
		has_more: false,
		data,
		...(notFoundOut.length > 0 ? { not_found: notFoundOut } : {}),
	};
}
