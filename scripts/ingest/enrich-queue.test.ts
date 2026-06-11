import { createEnrichQueue } from './enrich-queue';
import type { PendingCard } from './types';

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

async function run(): Promise<void> {
	// pull returns pushed items up to max
	{
		const q = createEnrichQueue();
		q.push(card('a'));
		q.push(card('b'));
		q.push(card('c'));
		const batch = await q.pull(2);
		check('pull(2) returns 2 items', batch.length === 2 && batch[0].cardId === 'a');
		check('queue size decremented', q.size() === 1);
	}

	// pull awaits a later push
	{
		const q = createEnrichQueue();
		const p = q.pull(5);
		setTimeout(() => q.push(card('x')), 10);
		const batch = await p;
		check('pull awaits then resolves on push', batch.length === 1 && batch[0].cardId === 'x');
	}

	// closed + empty resolves to []
	{
		const q = createEnrichQueue();
		q.close();
		const batch = await q.pull(5);
		check('closed+empty returns empty array', batch.length === 0);
		check('isDone true when closed+empty', q.isDone() === true);
	}

	// close drains remaining first
	{
		const q = createEnrichQueue();
		q.push(card('y'));
		q.close();
		const batch = await q.pull(5);
		check('closed drains remaining', batch.length === 1 && batch[0].cardId === 'y');
		const next = await q.pull(5);
		check('then empty after drain', next.length === 0);
	}

	console.log(`\n${passed} passed, ${failed} failed`);
	if (failed > 0) process.exit(1);
}

void run();
