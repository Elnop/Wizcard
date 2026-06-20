import { buildCollectionAddRequest } from './collectionAddRequest';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = '') {
	if (cond) {
		console.log(`PASS: ${name}`);
		passed++;
	} else {
		console.error(`FAIL: ${name} ${detail}`);
		failed++;
	}
}

const copies = [
	{ entry: { rowId: 'r1', ownerId: null } },
	{ entry: { rowId: 'r2', ownerId: 'u1' } }, // owned -> excluded
	{ entry: { rowId: 'r3', ownerId: null } },
];
const oracleScryfallIds = ['s1', 's2'];
const wishlist = [
	{ scryfallId: 's1', entry: { rowId: 'w1' } }, // matches
	{ scryfallId: 's2', entry: { rowId: 'w2' } }, // matches
	{ scryfallId: 'sX', entry: { rowId: 'w3' } }, // no match -> excluded
];

const req = buildCollectionAddRequest('Lightning Bolt', copies, oracleScryfallIds, wishlist);

check('cardName passthrough', req.cardName === 'Lightning Bolt');
check(
	'unownedRowIds excludes owned',
	JSON.stringify(req.unownedRowIds) === JSON.stringify(['r1', 'r3']),
	`got ${JSON.stringify(req.unownedRowIds)}`
);
check(
	'wishlistRowIds filtered by oracle scryfallIds',
	JSON.stringify(req.wishlistRowIds) === JSON.stringify(['w1', 'w2']),
	`got ${JSON.stringify(req.wishlistRowIds)}`
);

const empty = buildCollectionAddRequest('X', [], [], []);
check(
	'empty inputs -> empty arrays',
	empty.unownedRowIds.length === 0 && empty.wishlistRowIds.length === 0
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
