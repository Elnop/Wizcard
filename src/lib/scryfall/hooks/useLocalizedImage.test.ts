import { selectLocalized } from './useLocalizedImage';

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

const dataA = { img: 'A' };
const dataB = { img: 'B' };

// Matching key → expose the result.
check(
	'matching key returns data',
	selectLocalized(true, 'neo/1/fr', { key: 'neo/1/fr', data: dataA }) === dataA
);

// Stale result from a previous print/edition → must NOT leak onto the new card.
// This is the commander bug: edition changed (key now grn/5/fr) but result still
// tagged neo/1/fr.
check(
	'stale key (different edition) returns null',
	selectLocalized(true, 'grn/5/fr', { key: 'neo/1/fr', data: dataA }) === null
);

// No localization needed (e.g. English / no set) → null even if a result lingers.
check(
	'needsFetch=false returns null',
	selectLocalized(false, 'neo/1/fr', { key: 'neo/1/fr', data: dataB }) === null
);

// No result yet → null.
check('null result returns null', selectLocalized(true, 'neo/1/fr', null) === null);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
