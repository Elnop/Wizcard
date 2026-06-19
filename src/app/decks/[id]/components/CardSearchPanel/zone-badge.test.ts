import { ZONE_ABBREV, orderZones } from './zone-badge';
import type { DeckZone } from '@/types/decks';

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

check('mainboard abbrev', ZONE_ABBREV.mainboard === 'Main');
check('sideboard abbrev', ZONE_ABBREV.sideboard === 'Side');
check('maybeboard abbrev', ZONE_ABBREV.maybeboard === 'Maybe');
check('commander abbrev', ZONE_ABBREV.commander === 'Cmd');
check('tokens abbrev', ZONE_ABBREV.tokens === 'Tok');

// orderZones returns zones in stable canonical order regardless of input order
const input = new Map<DeckZone, number>([
	['tokens', 1],
	['mainboard', 2],
	['sideboard', 1],
]);
const ordered = orderZones(input).map(([z]) => z);
check(
	'orderZones canonical order',
	JSON.stringify(ordered) === JSON.stringify(['mainboard', 'sideboard', 'tokens']),
	`got ${JSON.stringify(ordered)}`
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
