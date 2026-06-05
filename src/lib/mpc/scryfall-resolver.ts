import type { ParsedCardFilename } from './parse-filename';
import type { CardType } from './types';
import { isMpcTag } from './mpc-tags';

const SCRYFALL_USER_AGENT = 'Wizcard/1.0';
const SCRYFALL_BASE = 'https://api.scryfall.com';
const BATCH_SIZE = 75;
// 200ms between requests — comfortably under Scryfall's 10 req/s limit
const SCRYFALL_DELAY_MS = 200;

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

// Card data needed to resolve a batch entry
export interface CardToResolve {
	id: string; // card DB id, used to map results back
	parsed: ParsedCardFilename;
	cardType: CardType;
	validSetCode: string | null; // setCode pre-validated against Scryfall set list
}

// Serialized queue: enforces one Scryfall request at a time with a fixed delay.
// A simple lastMs variable is a race condition under concurrent async callers.
let scryfallQueue: Promise<void> = Promise.resolve();
function throttle(): Promise<void> {
	scryfallQueue = scryfallQueue.then(() => new Promise((r) => setTimeout(r, SCRYFALL_DELAY_MS)));
	return scryfallQueue;
}

export function normalizeForScryfall(name: string): string {
	// eslint-disable-next-line sonarjs/slow-regex
	return name.replace(/\s*&\s*/gu, ' // ').trim();
}

export function variantCandidates(parsed: ParsedCardFilename): string[] {
	return [parsed.cardName, ...parsed.variants.filter((v) => !isMpcTag(v))]
		.map(normalizeForScryfall)
		.filter(Boolean);
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
		const wait = 2000 * Math.pow(2, attempt);
		console.warn(`  ⚠ Scryfall 429, retrying in ${wait}ms…`);
		await new Promise((r) => setTimeout(r, wait));
		return scryfallFetch(url, init, attempt + 1);
	}
	return res;
}

// POST /cards/collection with up to 75 name identifiers.
// Returns a map of lowercased name → enrichment for found cards.
async function batchByNames(
	names: string[]
): Promise<Map<string, Omit<ScryfallResolution, 'strategy'>>> {
	const result = new Map<string, Omit<ScryfallResolution, 'strategy'>>();
	for (let i = 0; i < names.length; i += BATCH_SIZE) {
		const batch = names.slice(i, i + BATCH_SIZE);
		let res: Response;
		try {
			res = await scryfallFetch(`${SCRYFALL_BASE}/cards/collection`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ identifiers: batch.map((name) => ({ name })) }),
			});
		} catch (err) {
			console.warn(`  ⚠ Scryfall batch failed: ${(err as Error).message}`);
			continue;
		}
		if (!res.ok) {
			console.warn(`  ⚠ Scryfall batch HTTP ${res.status}`);
			continue;
		}
		const data = (await res.json()) as { data: Record<string, unknown>[] };
		for (const card of data.data ?? []) {
			if (card['oracle_id']) {
				result.set((card['name'] as string).toLowerCase(), extractEnrichment(card));
			}
		}
	}
	return result;
}

// GET /cards/:set/:num — exact lookup, used when both setCode and collectorNumber are present.
async function resolveBySetAndNumber(
	setCode: string,
	collectorNumber: string
): Promise<Omit<ScryfallResolution, 'strategy'> | null> {
	const url = `${SCRYFALL_BASE}/cards/${encodeURIComponent(setCode.toLowerCase())}/${encodeURIComponent(collectorNumber)}`;
	let res: Response;
	try {
		res = await scryfallFetch(url);
	} catch (err) {
		console.warn(`  ⚠ Scryfall set+num fetch failed: ${(err as Error).message}`);
		return null;
	}
	if (res.status === 404) return null;
	if (!res.ok) {
		console.warn(`  ⚠ Scryfall GET ${url} failed: HTTP ${res.status}`);
		return null;
	}
	const card = (await res.json()) as Record<string, unknown>;
	if (!card['oracle_id']) return null;
	return extractEnrichment(card);
}

// GET /cards/named?fuzzy= — one call per name, cards only (not tokens).
async function resolveByFuzzy(name: string): Promise<Omit<ScryfallResolution, 'strategy'> | null> {
	const url = `${SCRYFALL_BASE}/cards/named?fuzzy=${encodeURIComponent(name)}`;
	let res: Response;
	try {
		res = await scryfallFetch(url);
	} catch (err) {
		console.warn(`  ⚠ Scryfall fuzzy fetch failed: ${(err as Error).message}`);
		return null;
	}
	if (res.status === 404) return null;
	if (!res.ok) {
		console.warn(`  ⚠ Scryfall fuzzy HTTP ${res.status} for "${name}"`);
		return null;
	}
	const card = (await res.json()) as Record<string, unknown>;
	if (!card['oracle_id']) return null;
	return extractEnrichment(card);
}

// ── Pass A helper ────────────────────────────────────────────────────────────
async function passA(
	resolvable: CardToResolve[],
	resolved: Map<string, ScryfallResolution>
): Promise<CardToResolve[]> {
	const needsNameLookup: CardToResolve[] = [];
	for (const card of resolvable) {
		if (card.validSetCode && card.parsed.collectorNumber) {
			const result = await resolveBySetAndNumber(card.validSetCode, card.parsed.collectorNumber);
			if (result) {
				resolved.set(card.id, { ...result, strategy: 'set_num' });
			} else {
				needsNameLookup.push(card);
			}
		} else {
			needsNameLookup.push(card);
		}
	}
	return needsNameLookup;
}

// ── Pass B helper ────────────────────────────────────────────────────────────
async function passB(
	needsNameLookup: CardToResolve[],
	resolved: Map<string, ScryfallResolution>
): Promise<void> {
	const primaryNames = [
		...new Set(needsNameLookup.map((c) => normalizeForScryfall(c.parsed.cardName)).filter(Boolean)),
	];
	const byPrimaryName = await batchByNames(primaryNames);

	const needsVariantLookup: CardToResolve[] = [];
	for (const card of needsNameLookup) {
		const key = normalizeForScryfall(card.parsed.cardName).toLowerCase();
		const found = byPrimaryName.get(key);
		if (found) {
			resolved.set(card.id, { ...found, strategy: 'name' });
		} else {
			needsVariantLookup.push(card);
		}
	}

	if (needsVariantLookup.length === 0) return;

	const variantToCards = new Map<string, string[]>();
	for (const card of needsVariantLookup) {
		const variants = card.parsed.variants
			.filter((v) => !isMpcTag(v))
			.map(normalizeForScryfall)
			.filter(Boolean);
		for (const v of variants) {
			const existing = variantToCards.get(v) ?? [];
			existing.push(card.id);
			variantToCards.set(v, existing);
		}
	}

	if (variantToCards.size === 0) return;

	const byVariantName = await batchByNames([...variantToCards.keys()]);
	for (const [variantName, cardIds] of variantToCards) {
		const found = byVariantName.get(variantName.toLowerCase());
		if (!found) continue;
		for (const cardId of cardIds) {
			if (!resolved.has(cardId)) resolved.set(cardId, { ...found, strategy: 'name' });
		}
	}
}

// ── Pass C helper ────────────────────────────────────────────────────────────
async function passC(
	resolvable: CardToResolve[],
	resolved: Map<string, ScryfallResolution>
): Promise<void> {
	const stillUnresolved = resolvable.filter((c) => !resolved.has(c.id) && c.cardType === 'card');

	const fuzzyCandidateToCards = new Map<string, string[]>();
	for (const card of stillUnresolved) {
		for (const candidate of variantCandidates(card.parsed)) {
			const existing = fuzzyCandidateToCards.get(candidate) ?? [];
			existing.push(card.id);
			fuzzyCandidateToCards.set(candidate, existing);
		}
	}

	for (const [candidate, cardIds] of fuzzyCandidateToCards) {
		if (cardIds.every((id) => resolved.has(id))) continue;
		const result = await resolveByFuzzy(candidate);
		if (!result) continue;
		for (const cardId of cardIds) {
			if (!resolved.has(cardId)) resolved.set(cardId, { ...result, strategy: 'fuzzy' });
		}
	}
}

/**
 * Resolve a batch of cards against Scryfall in three passes:
 *
 * Pass A — set+num GET for cards that have both setCode and collectorNumber
 * Pass B — batch POST /cards/collection by cardName, then by variants for not_found
 * Pass C — fuzzy GET for cards-only that are still unresolved (if fuzzy enabled)
 *
 * Returns a Map<cardId, ScryfallResolution> for all resolved cards.
 * Cards that remain unresolved are not in the map.
 */
export async function resolveBatch(
	cards: CardToResolve[],
	options: { fuzzy?: boolean } = {}
): Promise<Map<string, ScryfallResolution>> {
	const { fuzzy = true } = options;
	const resolved = new Map<string, ScryfallResolution>();
	const resolvable = cards.filter((c) => c.cardType !== 'cardback');

	const needsNameLookup = await passA(resolvable, resolved);
	await passB(needsNameLookup, resolved);
	if (fuzzy) await passC(resolvable, resolved);

	return resolved;
}
