import { buildEntriesBatch, newEntry } from './buildEntriesBatch';

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

// newEntry shape
const e = newEntry('row-1', { condition: 'NM' });
check('newEntry sets rowId', e.rowId === 'row-1');
check('newEntry sets dateAdded', typeof e.dateAdded === 'string' && e.dateAdded.length > 0);
check('newEntry applies overrides', e.condition === 'NM');

// count = 3 → 3 distinct rows
const rows = buildEntriesBatch('sf-1', 3, { condition: 'LP' });
check('count 3 → 3 rows', rows.length === 3);
const ids = new Set(rows.map((r) => r.rowId));
check('3 distinct rowIds', ids.size === 3);
check(
	'scryfallId carried',
	rows.every((r) => r.scryfallId === 'sf-1')
);
check(
	'patch applied to each entry',
	rows.every((r) => r.entry.condition === 'LP')
);
check(
	'entry.rowId matches row.rowId',
	rows.every((r) => r.entry.rowId === r.rowId)
);

// clamp
check('count 0 → 1 row', buildEntriesBatch('x', 0).length === 1);
check('count -5 → 1 row', buildEntriesBatch('x', -5).length === 1);
check('count NaN → 1 row', buildEntriesBatch('x', Number.NaN).length === 1);
check('count 2.7 → 2 rows', buildEntriesBatch('x', 2.7).length === 2);
check('count 1 → 1 row', buildEntriesBatch('x', 1).length === 1);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
