/* eslint-disable sonarjs/no-duplicate-string -- test fixtures reuse literal zone tags by design */
import { buildDeckCardIndex, type DeckCopyForIndex } from './deck-card-index';

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

const copies: DeckCopyForIndex[] = [
	// 2x mainboard + 1x sideboard for oracle "bolt"
	{ oracleId: 'bolt', tags: ['deck:mainboard'] },
	{ oracleId: 'bolt', tags: ['deck:mainboard'] },
	{ oracleId: 'bolt', tags: ['deck:sideboard'] },
	// 1x mainboard for oracle "swamp" (no zone tag -> defaults to mainboard)
	{ oracleId: 'swamp', tags: undefined },
	// a token
	{ oracleId: 'goblin', tags: ['deck:tokens'] },
	// copy without oracleId is ignored
	{ oracleId: undefined, tags: ['deck:mainboard'] },
];

const index = buildDeckCardIndex(copies);

const bolt = index.get('bolt');
check('bolt present', bolt != null);
check('bolt mainboard 2', bolt?.get('mainboard') === 2, `got ${bolt?.get('mainboard')}`);
check('bolt sideboard 1', bolt?.get('sideboard') === 1, `got ${bolt?.get('sideboard')}`);
check('bolt no maybeboard', bolt?.get('maybeboard') === undefined);

const swamp = index.get('swamp');
check(
	'swamp mainboard 1 (untagged default)',
	swamp?.get('mainboard') === 1,
	`got ${swamp?.get('mainboard')}`
);

const goblin = index.get('goblin');
check('goblin tokens 1', goblin?.get('tokens') === 1, `got ${goblin?.get('tokens')}`);

check(
	'undefined oracleId ignored',
	!index.has(undefined as unknown as string) && index.size === 3,
	`size ${index.size}`
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
