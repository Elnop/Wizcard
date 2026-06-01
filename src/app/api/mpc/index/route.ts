import { NextResponse } from 'next/server';
import type { MpcIndexEntry } from '@/lib/mpc/types';

export const revalidate = 86400;

const MPCFILL_BASE = 'https://mpcfill.com/2';
const FETCH_OPTS = { headers: { 'User-Agent': 'Wizcard/1.0' } };

// eslint-disable-next-line sonarjs/slow-regex
const SET_RE = /\s*\[[A-Z0-9]+\]\s*/g;
// eslint-disable-next-line sonarjs/slow-regex
const NUM_RE = /\s*\{\d+\}\s*/g;
// eslint-disable-next-line sonarjs/slow-regex
const VARIANT_RE = /\s*\([^)]+\)\s*$/;

function normalizeName(raw: string): string {
	return raw.replace(SET_RE, ' ').replace(NUM_RE, ' ').replace(VARIANT_RE, '').trim();
}

interface MpcfillCard {
	name: string;
	identifier: string;
	smallThumbnailUrl: string;
	mediumThumbnailUrl: string;
	tags: string[];
	dpi: number;
	source: string;
	sourceName: string;
}

interface FirstPagesSource {
	hits: number;
	pages: number;
	cards: MpcfillCard[];
}

interface FirstPagesResponse {
	results: Record<string, FirstPagesSource>;
}

async function sleep(ms: number) {
	return new Promise((r) => setTimeout(r, ms));
}

async function buildIndex(): Promise<MpcIndexEntry[]> {
	const firstRes = await fetch(`${MPCFILL_BASE}/newCardsFirstPages/`, FETCH_OPTS);
	if (!firstRes.ok) throw new Error(`newCardsFirstPages failed: ${firstRes.status}`);
	const firstData = (await firstRes.json()) as FirstPagesResponse;

	const entries: MpcIndexEntry[] = [];

	for (const [sourceKey, sourceData] of Object.entries(firstData.results)) {
		if (!sourceData.hits) continue;

		for (let page = 1; page <= sourceData.pages; page++) {
			const url = `${MPCFILL_BASE}/newCardsPage/?source=${encodeURIComponent(sourceKey)}&page=${page}&cardType=CARD`;
			const res = await fetch(url, FETCH_OPTS);
			if (!res.ok) continue;

			const data = (await res.json()) as { cards: MpcfillCard[] };
			for (const card of data.cards ?? []) {
				entries.push({
					identifier: card.identifier,
					name: normalizeName(card.name),
					rawName: card.name,
					sourceName: card.sourceName ?? sourceKey,
					sourceKey,
					smallThumbnailUrl: card.smallThumbnailUrl,
					mediumThumbnailUrl: card.mediumThumbnailUrl,
					tags: card.tags ?? [],
					dpi: card.dpi ?? 0,
				});
			}

			await sleep(100);
		}
	}

	return entries;
}

let _cache: MpcIndexEntry[] | null = null;
let _cacheBuiltAt = 0;
const CACHE_TTL = 86400_000;

async function getIndex(): Promise<MpcIndexEntry[]> {
	if (_cache && Date.now() - _cacheBuiltAt < CACHE_TTL) return _cache;
	_cache = await buildIndex();
	_cacheBuiltAt = Date.now();
	return _cache;
}

export async function GET(req: Request) {
	const { searchParams } = new URL(req.url);
	const rawName = searchParams.get('name');

	if (!rawName) {
		return NextResponse.json({ error: 'Missing ?name= parameter' }, { status: 400 });
	}

	try {
		const index = await getIndex();
		const needle = normalizeName(rawName).toLowerCase();
		const matches = index.filter((e) => e.name.toLowerCase() === needle);
		return NextResponse.json(matches);
	} catch (err) {
		console.error('[/api/mpc/index]', err);
		return NextResponse.json({ error: 'Index build failed' }, { status: 502 });
	}
}
