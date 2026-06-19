import { useDeckStore } from './deck-store';
import { useCollectionStore } from '@/lib/collection/store/collection-store';
import type { CardEntry } from '@/types/cards';

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

const noop = () => {};
const USER = 'user-1';
const ROW = 'row-1';
const SCRYFALL = 'scry-1';

function entry(overrides?: Partial<CardEntry>): CardEntry {
	return {
		rowId: ROW,
		dateAdded: '2026-01-01T00:00:00.000Z',
		tags: ['deck:mainboard'],
		...overrides,
	};
}

function reset() {
	useDeckStore.setState({
		activeDeckCards: { [ROW]: { scryfallId: SCRYFALL, entry: entry() } },
	});
	useCollectionStore.setState({ entries: {} });
}

// --- Owning a deck card not yet in the collection inserts it into the collection store ---
reset();
useDeckStore.getState().toggleOwned(ROW, USER, undefined, noop);

const colAfterOwn = useCollectionStore.getState().entries;
check('owning inserts a collection entry under the same rowId', colAfterOwn[ROW] != null);
check(
	'inserted entry keeps scryfallId',
	colAfterOwn[ROW]?.scryfallId === SCRYFALL,
	`got ${colAfterOwn[ROW]?.scryfallId}`
);
check(
	'inserted entry has ownerId set',
	colAfterOwn[ROW]?.entry.ownerId === USER,
	`got ${colAfterOwn[ROW]?.entry.ownerId}`
);

// --- Un-owning a deck card removes it from the collection store ---
// (deck card is now owned; toggle again to un-own)
useDeckStore.getState().toggleOwned(ROW, USER, undefined, noop);
const colAfterUnown = useCollectionStore.getState().entries;
check(
	'un-owning removes the collection entry',
	colAfterUnown[ROW] == null,
	`still present: ${JSON.stringify(colAfterUnown[ROW])}`
);

// --- The deck card itself remains in the deck store both times ---
check(
	'deck card still present after toggles',
	useDeckStore.getState().activeDeckCards[ROW] != null
);
check(
	'deck card ownerId cleared after un-own',
	useDeckStore.getState().activeDeckCards[ROW]?.entry.ownerId === undefined
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
