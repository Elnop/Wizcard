// Remote source discovery: mpcfill source list + Scryfall set codes.

import { sharedScryfallThrottle } from '../../src/lib/scryfall/utils/scryfall-throttle';
import { MPCFILL_URL, SCRYFALL_SETS_URL } from './config';
import { fetchWithRetry } from './drive-client';
import type { MpcfillSourceRaw, MpcfillSourcesResponse } from './types';

export async function fetchSources(): Promise<MpcfillSourceRaw[]> {
	const res = await fetchWithRetry(MPCFILL_URL);
	if (!res.ok) throw new Error(`mpcfill fetch failed: HTTP ${res.status}`);
	const data = (await res.json()) as MpcfillSourcesResponse;
	return Object.values(data.results ?? {}).filter((s) => s.sourceType === 'Google Drive');
}

export async function fetchScryfallSetCodes(): Promise<Set<string>> {
	// Through the shared throttle so /sets shares the gap counter with the
	// resolver's /cards calls — no Scryfall request bypasses the limiter.
	const res = await sharedScryfallThrottle.fetch(SCRYFALL_SETS_URL);
	if (!res.ok) throw new Error(`Scryfall /sets failed: HTTP ${res.status}`);
	const json = (await res.json()) as { data: Array<{ code: string }> };
	return new Set(json.data.map((s) => s.code.toUpperCase()));
}
