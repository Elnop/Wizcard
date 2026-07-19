// HTTP access to MTGJSON's preconstructed deck files.
//
// Three endpoints:
//   Meta.json      — global {version, date}; drives the skip-if-unchanged check
//   DeckList.json  — manifest of every precon (fileName is our stable key)
//   AllDeckFiles/<fileName>.json — one deck's full card lists

const BASE = 'https://mtgjson.com/api/v5';

export interface DeckListEntry {
	code: string;
	fileName: string;
	name: string;
	releaseDate: string | null;
	type: string;
}

export interface MtgJsonCard {
	count: number;
	name: string;
	identifiers: { scryfallId?: string };
}

export interface MtgJsonDeck {
	name: string;
	code: string;
	type: string;
	releaseDate: string | null;
	commander: MtgJsonCard[];
	mainBoard: MtgJsonCard[];
	sideBoard: MtgJsonCard[];
}

// MTGJSON wraps every payload in {meta, data}. Response bodies must be fully
// consumed (res.json() does this); a non-ok body is drained to avoid leaking
// native memory, the same failure mode hit by the Scryfall ingest worker.
async function getJson<T>(url: string): Promise<T> {
	const res = await fetch(url, {
		headers: { 'User-Agent': 'Wizcard/1.0 precon-sync' },
		signal: AbortSignal.timeout(60_000),
	});
	if (!res.ok) {
		await res.body?.cancel();
		throw new Error(`[mtgjson] GET ${url} → ${res.status} ${res.statusText}`);
	}
	const payload = (await res.json()) as { data: T };
	return payload.data;
}

export async function fetchMeta(): Promise<{ version: string; date: string }> {
	return getJson<{ version: string; date: string }>(`${BASE}/Meta.json`);
}

export async function fetchDeckList(): Promise<DeckListEntry[]> {
	return getJson<DeckListEntry[]>(`${BASE}/DeckList.json`);
}

export async function fetchDeck(fileName: string): Promise<MtgJsonDeck> {
	// fileName comes from DeckList.json and may contain spaces/underscores.
	return getJson<MtgJsonDeck>(`${BASE}/decks/${encodeURIComponent(fileName)}.json`);
}
