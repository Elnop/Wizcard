import { runEnrichWorker } from './enrich-worker';
import type { PendingCard } from './types';
import type { ScryfallResolution } from '../../src/lib/mpc/scryfall-resolver';

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean): void {
	if (cond) {
		console.log(`PASS: ${label}`);
		passed++;
	} else {
		console.error(`FAIL: ${label}`);
		failed++;
	}
}

function card(id: string): PendingCard {
	return {
		cardId: id,
		file: { id, name: `${id}.png`, folderPath: [] },
		parsed: {} as PendingCard['parsed'],
		setCode: null,
		cardType: 'card',
		allTags: [],
		isReEnrich: false,
		alreadyMirrored: false,
	};
}

function resolution(id: string): ScryfallResolution {
	return {
		oracleName: id,
		oracleId: `oracle-${id}`,
		strategy: 'name',
		colors: [],
		colorIdentity: [],
		cmc: null,
		typeLine: null,
		manaCost: null,
		oracleText: null,
		rarity: null,
		setName: null,
		artist: null,
	};
}

async function run(): Promise<void> {
	// Drains the DB scan in batches until empty + parsing done. a,c resolve; b doesn't.
	{
		// Three "rows" delivered across scans (limit=2): [a,b] then [c] then [].
		const scans: PendingCard[][] = [[card('a'), card('b')], [card('c')], []];
		const reEnriched: string[] = [];
		let scanCalls = 0;

		const result = await runEnrichWorker({
			validSetCodes: new Set<string>(),
			isParsingDone: () => true, // already done; empty scan => stop
			batchSize: 2,
			idlePollMs: 1,
			deps: {
				resolveBatch: async (cards) => {
					const map = new Map<string, ScryfallResolution>();
					for (const c of cards) if (c.id === 'a' || c.id === 'c') map.set(c.id, resolution(c.id));
					return map;
				},
				reEnrichCard: async (cardId) => {
					reEnriched.push(cardId);
					return { error: null };
				},
				fetchUnenrichedCards: async () => scans[Math.min(scanCalls++, scans.length - 1)],
				countEnrichSnapshot: async () => ({ total: 0, remaining: 0, failedPre: 0, stale: 0 }),
			},
		});

		check('all three cards written', reEnriched.length === 3);
		check('resolved count = 2 (a,c)', result.resolved === 2);
		check('unresolved count = 1 (b)', result.unresolved === 1);
	}

	// failure path: reEnrichCard error increments failed, others still counted
	{
		const scans: PendingCard[][] = [[card('ok'), card('boom')], []];
		let scanCalls = 0;
		const result = await runEnrichWorker({
			validSetCodes: new Set<string>(),
			isParsingDone: () => true,
			batchSize: 75,
			idlePollMs: 1,
			deps: {
				resolveBatch: async (cards) => {
					const map = new Map<string, ScryfallResolution>();
					for (const c of cards) map.set(c.id, resolution(c.id));
					return map;
				},
				reEnrichCard: async (cardId) => ({
					error: cardId === 'boom' ? 'write failed' : null,
				}),
				fetchUnenrichedCards: async () => scans[Math.min(scanCalls++, scans.length - 1)],
				countEnrichSnapshot: async () => ({ total: 0, remaining: 0, failedPre: 0, stale: 0 }),
			},
		});
		check('failed path counts error card', result.failed === 1);
		check('failed path still counts success', result.resolved === 1);
	}

	// keeps polling while parsing is in-flight: empty scan + not-done => waits, then
	// picks up a late insert once it appears.
	{
		let parsingDone = false;
		const reEnriched: string[] = [];
		let scanCalls = 0;
		const scanResult = (): PendingCard[] => {
			scanCalls++;
			// scan 1: empty (caught up, parsing still running)
			// scan 2: a late card appears
			// scan 3+: empty
			if (scanCalls === 2) return [card('late')];
			return [];
		};
		// Flip parsingDone shortly after the worker starts idling.
		setTimeout(() => {
			parsingDone = true;
		}, 30);

		const result = await runEnrichWorker({
			validSetCodes: new Set<string>(),
			isParsingDone: () => parsingDone,
			batchSize: 75,
			idlePollMs: 5,
			deps: {
				resolveBatch: async (cards) => {
					const map = new Map<string, ScryfallResolution>();
					for (const c of cards) map.set(c.id, resolution(c.id));
					return map;
				},
				reEnrichCard: async (cardId) => {
					reEnriched.push(cardId);
					return { error: null };
				},
				fetchUnenrichedCards: async () => scanResult(),
				countEnrichSnapshot: async () => ({ total: 0, remaining: 0, failedPre: 0, stale: 0 }),
			},
		});
		check('late insert is enriched after idle poll', reEnriched.includes('late'));
		check('worker terminates once parsing done + empty', result.resolved === 1);
	}

	// progress total reflects the DB count (done + remaining), not the running sum
	// of processed batches.
	{
		const { logger } = await import('./config');
		// enrichResolved is cumulative on the shared logger singleton across these
		// in-process tests, so assert on the delta this run produced, not absolutes.
		const resolvedBefore = logger.getHudState().enrichResolved;
		const scans: PendingCard[][] = [[card('z')], []];
		let scanCalls = 0;
		await runEnrichWorker({
			validSetCodes: new Set<string>(),
			isParsingDone: () => true,
			batchSize: 75,
			idlePollMs: 1,
			deps: {
				resolveBatch: async (cards) => {
					const map = new Map<string, ScryfallResolution>();
					for (const c of cards) map.set(c.id, resolution(c.id));
					return map;
				},
				reEnrichCard: async () => ({ error: null }),
				fetchUnenrichedCards: async () => scans[Math.min(scanCalls++, scans.length - 1)],
				// Snapshot: 200 cards total in scope, 10 never enriched (grey), 0 stale →
				// 190 already enriched before this run (blue). The bar spans the whole DB.
				countEnrichSnapshot: async () => ({ total: 200, remaining: 10, failedPre: 0, stale: 0 }),
			},
		});
		const s = logger.getHudState();
		// Denominator is the fixed DB total (not done+remaining as before).
		check('enrich total is the DB total', s.enrichTotal === 200);
		check('blue = total - remaining - failedPre - stale', s.enrichBlue === 190);
		check('green grows by this run (card z resolved)', s.enrichResolved - resolvedBefore === 1);
	}

	// Pre-existing failures (enriched_at set but no oracle_id) show as RED at launch
	// and feed the snapshot, while blue (skip) excludes them.
	{
		const { logger } = await import('./config');
		await runEnrichWorker({
			validSetCodes: new Set<string>(),
			isParsingDone: () => true,
			batchSize: 75,
			idlePollMs: 1,
			deps: {
				resolveBatch: async () => new Map<string, ScryfallResolution>(),
				reEnrichCard: async () => ({ error: null }),
				fetchUnenrichedCards: async () => [], // nothing to do — just read the snapshot
				// 100 total: 70 resolved-before (blue), 25 unmatched (red), 5 grey.
				countEnrichSnapshot: async () => ({
					total: 100,
					remaining: 5,
					failedPre: 25,
					stale: 0,
				}),
			},
		});
		const s = logger.getHudState();
		check('red = pre-existing unmatched (failedPre)', s.enrichFailed === 25);
		check('blue excludes pre-existing failures', s.enrichBlue === 70);
	}

	// --re-enrich: yellow (outdated) is a LIVE count that shrinks as the worker
	// re-attempts stale cards. reEnrichCard stamps a fresh enriched_at, so the next
	// snapshot reports fewer stale → yellow drops while blue stays frozen.
	{
		const { logger } = await import('./config');
		// Two stale cards to re-enrich, then nothing.
		const scans: PendingCard[][] = [[card('s1'), card('s2')], []];
		let scanCalls = 0;
		// Snapshot reflects the stale count dropping from 2 → 0 once re-enriched.
		let staleLeft = 2;
		await runEnrichWorker({
			validSetCodes: new Set<string>(),
			isParsingDone: () => true,
			includeStale: true,
			batchSize: 75,
			idlePollMs: 1,
			totalRefreshMs: 0, // re-snapshot every batch so the drop is observable
			deps: {
				resolveBatch: async (cards) => {
					const map = new Map<string, ScryfallResolution>();
					for (const c of cards) map.set(c.id, resolution(c.id));
					return map;
				},
				reEnrichCard: async () => {
					if (staleLeft > 0) staleLeft--;
					return { error: null };
				},
				fetchUnenrichedCards: async () => scans[Math.min(scanCalls++, scans.length - 1)],
				// total 100: blue baseline 90 at launch, `staleLeft` outdated, rest grey.
				countEnrichSnapshot: async () => ({
					total: 100,
					remaining: 100 - 90 - staleLeft,
					failedPre: 0,
					stale: staleLeft,
				}),
			},
		});
		const s = logger.getHudState();
		check('yellow shrinks to 0 after re-enriching outdated', s.enrichStale === 0);
		// frozenBlue at first snapshot = total - remaining - failedPre - stale
		//                              = 100 - (100-90-2) - 0 - 2 = 90, then frozen.
		check('blue stays frozen at launch baseline (90)', s.enrichBlue === 90);
	}

	console.log(`\n${passed} passed, ${failed} failed`);
	if (failed > 0) process.exit(1);
}

void run();
