import { runEnrichWorker } from './enrich-worker';
import { createEnrichQueue } from './enrich-queue';
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
	{
		const q = createEnrichQueue();
		q.push(card('a')); // will resolve
		q.push(card('b')); // will NOT resolve (unresolved)
		const reEnriched: string[] = [];
		const scanned: string[] = [];

		const workerPromise = runEnrichWorker({
			queue: q,
			validSetCodes: new Set<string>(),
			includeStale: false,
			batchSize: 75,
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
				fetchUnenrichedCards: async () => {
					if (scanned.length > 0) return [];
					scanned.push('scan');
					return [card('c')];
				},
			},
		});

		setTimeout(() => q.close(), 20);
		const result = await workerPromise;

		check('all three cards written', reEnriched.length === 3);
		check('resolved count = 2 (a,c)', result.resolved === 2);
		check('unresolved count = 1 (b)', result.unresolved === 1);
		check('final scan ran once', scanned.length === 1);
	}

	// failure path: reEnrichCard error increments failed, others still counted
	{
		const q = createEnrichQueue();
		q.push(card('ok')); // resolves + writes fine
		q.push(card('boom')); // resolves but write fails
		setTimeout(() => q.close(), 20);
		const result = await runEnrichWorker({
			queue: q,
			validSetCodes: new Set<string>(),
			batchSize: 75,
			deps: {
				resolveBatch: async (cards) => {
					const map = new Map<string, ScryfallResolution>();
					for (const c of cards) map.set(c.id, resolution(c.id));
					return map;
				},
				reEnrichCard: async (cardId) => ({
					error: cardId === 'boom' ? 'write failed' : null,
				}),
				fetchUnenrichedCards: async () => [],
			},
		});
		check('failed path counts error card', result.failed === 1);
		check('failed path still counts success', result.resolved === 1);
	}

	console.log(`\n${passed} passed, ${failed} failed`);
	if (failed > 0) process.exit(1);
}

void run();
