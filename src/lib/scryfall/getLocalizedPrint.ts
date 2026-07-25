// Resolve ONE print in the requested language, DB-first. Goes through
// getCardCollection → fetcher → the DB-first /api/scryfall/cards/collection route.
// Client-safe: no card-source / server import. Returns null when neither the DB
// nor the Scryfall fallback resolves it. Replaces the old two-step "resolve
// English then re-fetch in lang" pattern — the language is in the identifier.
//
// Calls are COALESCED: every card on a page resolves its localized print
// independently (one CardImage each), which used to mean one round-trip per card
// — ~170 sequential POSTs for a 176-card deck in French, all landing on our own
// proxy, whose Scryfall rate limit is shared by every user. The identifiers are
// collected over a microtask-plus-tick window and sent as a single batched
// request instead, which the route and the DB catalog already handle natively
// (byCollection groups set+collector_number lookups).

import { getCardCollection } from '@/lib/scryfall/endpoints/cards';
import type { ScryfallCardIdentifier } from '@/lib/scryfall/types/scryfall';
import type { Card } from '@/types/cards';

// The route caps a batch at 75 identifiers (MAX_IDENTIFIERS), so a flush never
// exceeds it — extra callers simply start a new batch.
const MAX_BATCH = 75;
// How long to keep collecting before flushing. One tick is enough to capture a
// render pass worth of CardImage mounts without adding perceptible latency.
const BATCH_WINDOW_MS = 16;

type Pending = {
	key: string;
	identifier: ScryfallCardIdentifier;
	resolve: (card: Card | null) => void;
	reject: (err: unknown) => void;
};

let queue: Pending[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
// Identical identifiers issued in the same window share one slot and one result.
const inFlightByKey = new Map<string, Promise<Card | null>>();

function keyFor(set: string, collectorNumber: string, lang: string): string {
	return `${set}/${collectorNumber}/${lang}`;
}

async function flush(): Promise<void> {
	timer = null;
	const batch = queue;
	queue = [];
	if (batch.length === 0) return;

	// Deduplicate within the batch: several copies of the same print are common
	// in a deck, and they must not consume separate identifier slots.
	const bySlot = new Map<string, Pending[]>();
	for (const p of batch) {
		const arr = bySlot.get(p.key) ?? [];
		arr.push(p);
		bySlot.set(p.key, arr);
	}
	const slots = [...bySlot.entries()];

	for (let i = 0; i < slots.length; i += MAX_BATCH) {
		await runChunk(slots.slice(i, i + MAX_BATCH));
	}
}

type Slot = [key: string, waiters: Pending[]];

async function runChunk(chunk: Slot[]): Promise<void> {
	try {
		const list = await getCardCollection(chunk.map(([, waiters]) => waiters[0].identifier));
		// The route preserves request order and drops unresolved identifiers into
		// `not_found`, so match each card back by its own set/number/lang rather than
		// by position — robust to any reordering or omission.
		const byKey = new Map<string, Card>();
		for (const card of list.data) {
			if (card.set && card.collector_number) {
				byKey.set(keyFor(card.set, card.collector_number, card.lang ?? 'en'), card);
			}
		}
		for (const [key, waiters] of chunk) {
			const card = byKey.get(key) ?? null;
			for (const w of waiters) w.resolve(card);
		}
	} catch (err) {
		for (const [, waiters] of chunk) {
			for (const w of waiters) w.reject(err);
		}
	}
}

export function getLocalizedPrint(
	set: string,
	collectorNumber: string,
	lang: string,
	signal?: AbortSignal
): Promise<Card | null> {
	if (signal?.aborted) return Promise.resolve(null);

	const key = keyFor(set, collectorNumber, lang);
	// One shared request per print, but each CALLER keeps its own abort semantics:
	// a caller that aborts settles to null without cancelling the shared batch,
	// which other still-interested callers depend on.
	const shared =
		inFlightByKey.get(key) ??
		(() => {
			const p = new Promise<Card | null>((resolve, reject) => {
				queue.push({
					key,
					identifier: { set, collector_number: collectorNumber, lang },
					resolve,
					reject,
				});
				if (timer === null) timer = setTimeout(() => void flush(), BATCH_WINDOW_MS);
			}).finally(() => {
				inFlightByKey.delete(key);
			});
			inFlightByKey.set(key, p);
			return p;
		})();

	if (!signal) return shared;
	// Mirror the previous per-call cancellation: an aborted caller resolves null
	// (callers treat null as "no localized print"), never a rejection.
	return new Promise<Card | null>((resolve, reject) => {
		const onAbort = (): void => resolve(null);
		signal.addEventListener('abort', onAbort, { once: true });
		shared.then(
			(card) => {
				signal.removeEventListener('abort', onAbort);
				resolve(signal.aborted ? null : card);
			},
			(err) => {
				signal.removeEventListener('abort', onAbort);
				if (signal.aborted) resolve(null);
				else reject(err);
			}
		);
	});
}
