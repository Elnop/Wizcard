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
			},
		});
		check('late insert is enriched after idle poll', reEnriched.includes('late'));
		check('worker terminates once parsing done + empty', result.resolved === 1);
	}

	console.log(`\n${passed} passed, ${failed} failed`);
	if (failed > 0) process.exit(1);
}

void run();
