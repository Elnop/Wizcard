import type { ParsedCardFilename } from './parse-filename';
import type { CardType } from './types';
import { isMpcTag } from './mpc-tags';

const SCRYFALL_USER_AGENT = 'Wizcard/1.0';
const SCRYFALL_BASE = 'https://api.scryfall.com';

export interface ScryfallResolution {
	oracleName: string;
	oracleId: string;
	strategy: 'set_num' | 'name' | 'fuzzy';
	colors: string[];
	colorIdentity: string[];
	cmc: number | null;
	typeLine: string | null;
	manaCost: string | null;
	oracleText: string | null;
	rarity: string | null;
	setName: string | null;
	artist: string | null;
}

// Serialized queue: one Scryfall call at a time, minimum 100ms between calls.
// A simple lastMs check is a race condition under pLimit concurrency — multiple
// coroutines read the same lastMs before any of them updates it.
let scryfallQueue: Promise<void> = Promise.resolve();
function throttle(): Promise<void> {
	scryfallQueue = scryfallQueue.then(() => new Promise((r) => setTimeout(r, 110)));
	return scryfallQueue;
}

function normalizeForScryfall(name: string): string {
	// eslint-disable-next-line sonarjs/slow-regex
	return name.replace(/\s*&\s*/gu, ' // ').trim();
}

function extractEnrichment(card: Record<string, unknown>): Omit<ScryfallResolution, 'strategy'> {
	return {
		oracleName: card['name'] as string,
		oracleId: card['oracle_id'] as string,
		colors: (card['colors'] as string[] | undefined) ?? [],
		colorIdentity: (card['color_identity'] as string[] | undefined) ?? [],
		cmc: (card['cmc'] as number | undefined) ?? null,
		typeLine: (card['type_line'] as string | undefined) ?? null,
		manaCost: (card['mana_cost'] as string | undefined) ?? null,
		oracleText: (card['oracle_text'] as string | undefined) ?? null,
		rarity: (card['rarity'] as string | undefined) ?? null,
		setName: (card['set_name'] as string | undefined) ?? null,
		artist: (card['artist'] as string | undefined) ?? null,
	};
}

async function scryfallFetch(url: string, init?: RequestInit, attempt = 0): Promise<Response> {
	await throttle();
	const res = await fetch(url, {
		...init,
		headers: { 'User-Agent': SCRYFALL_USER_AGENT, ...init?.headers },
	});
	if (res.status === 429 && attempt < 4) {
		const wait = 1000 * Math.pow(2, attempt);
		console.warn(`  ⚠ Scryfall 429, retrying in ${wait}ms…`);
		await new Promise((r) => setTimeout(r, wait));
		return scryfallFetch(url, init, attempt + 1);
	}
	return res;
}

async function resolveBySetAndNumber(
	setCode: string,
	collectorNumber: string
): Promise<Omit<ScryfallResolution, 'strategy'> | null> {
	const url = `${SCRYFALL_BASE}/cards/${encodeURIComponent(setCode.toLowerCase())}/${encodeURIComponent(collectorNumber)}`;
	const res = await scryfallFetch(url);
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`Scryfall GET ${url} failed: HTTP ${res.status}`);
	const card = (await res.json()) as Record<string, unknown>;
	if (!card['oracle_id']) return null;
	return extractEnrichment(card);
}

async function resolveByName(name: string): Promise<Omit<ScryfallResolution, 'strategy'> | null> {
	const res = await scryfallFetch(`${SCRYFALL_BASE}/cards/collection`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ identifiers: [{ name }] }),
	});
	if (!res.ok) throw new Error(`Scryfall POST /cards/collection failed: HTTP ${res.status}`);
	const data = (await res.json()) as { data: Record<string, unknown>[]; not_found: unknown[] };
	if (!data.data?.length) return null;
	const card = data.data[0];
	if (!card['oracle_id']) return null;
	return extractEnrichment(card);
}

async function resolveByFuzzy(name: string): Promise<Omit<ScryfallResolution, 'strategy'> | null> {
	const url = `${SCRYFALL_BASE}/cards/named?fuzzy=${encodeURIComponent(name)}`;
	const res = await scryfallFetch(url);
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`Scryfall GET ${url} failed: HTTP ${res.status}`);
	const card = (await res.json()) as Record<string, unknown>;
	if (!card['oracle_id']) return null;
	return extractEnrichment(card);
}

async function tryNameCandidates(
	candidates: string[]
): Promise<Omit<ScryfallResolution, 'strategy'> | null> {
	for (const candidate of candidates) {
		try {
			const result = await resolveByName(candidate);
			if (result) return result;
		} catch (err) {
			console.warn(`  ⚠ Strategy B failed for "${candidate}": ${(err as Error).message}`);
		}
	}
	return null;
}

async function tryFuzzyCandidates(
	candidates: string[]
): Promise<Omit<ScryfallResolution, 'strategy'> | null> {
	for (const candidate of candidates) {
		try {
			const result = await resolveByFuzzy(candidate);
			if (result) return result;
		} catch (err) {
			console.warn(`  ⚠ Strategy C failed for "${candidate}": ${(err as Error).message}`);
		}
	}
	return null;
}

export async function resolveCard(
	parsed: ParsedCardFilename,
	cardType: CardType,
	options: { fuzzy?: boolean } = {}
): Promise<ScryfallResolution | null> {
	if (cardType === 'cardback') return null;

	const { fuzzy = true } = options;

	if (parsed.setCode && parsed.collectorNumber) {
		try {
			const result = await resolveBySetAndNumber(parsed.setCode, parsed.collectorNumber);
			if (result) return { ...result, strategy: 'set_num' };
		} catch (err) {
			console.warn(`  ⚠ Strategy A failed for ${parsed.cardName}: ${(err as Error).message}`);
		}
	}

	const candidates = [parsed.cardName, ...parsed.variants.filter((v) => !isMpcTag(v))]
		.map(normalizeForScryfall)
		.filter(Boolean);

	const byName = await tryNameCandidates(candidates);
	if (byName) return { ...byName, strategy: 'name' };

	if (fuzzy && cardType === 'card') {
		const byFuzzy = await tryFuzzyCandidates(candidates);
		if (byFuzzy) return { ...byFuzzy, strategy: 'fuzzy' };
	}

	return null;
}
