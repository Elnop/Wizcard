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
const ROW = 'owned-row-1';
const SCRYFALL = 'scry-1';
const DECK = 'deck-1';

function entry(overrides?: Partial<CardEntry>): CardEntry {
	return {
		rowId: ROW,
		dateAdded: '2026-01-01T00:00:00.000Z',
		tags: ['deck:mainboard'],
		deckId: DECK,
		ownerId: USER,
		...overrides,
	};
}

function reset() {
	// No `decks` entry needed: the action only reads decks[deckId] to bump
	// updatedAt, guarded by `if (deck)`, so its absence is a no-op here.
	useDeckStore.setState({
		activeDeckId: DECK,
		activeDeckCards: { [ROW]: { scryfallId: SCRYFALL, entry: entry() } },
		decks: {},
	});
	useCollectionStore.setState({
		entries: { [ROW]: { scryfallId: SCRYFALL, entry: entry() } },
	});
}

reset();
useDeckStore.getState().unassignCollectionCopyFromDeckCard(ROW, DECK, 'mainboard', USER, noop);

const deckCards = useDeckStore.getState().activeDeckCards;
const col = useCollectionStore.getState().entries;

// (a) freed copy stays owned, deckId cleared, still in collection
check('freed copy still in collection store', col[ROW] != null);
check(
	'freed copy keeps ownerId',
	col[ROW]?.entry.ownerId === USER,
	`got ${col[ROW]?.entry.ownerId}`
);
check(
	'freed copy deckId cleared',
	col[ROW]?.entry.deckId === undefined,
	`got ${col[ROW]?.entry.deckId}`
);

// (b) old owned row no longer in the deck
check('old owned row removed from deck', deckCards[ROW] == null);

// (c) a new non-owned placeholder exists in the deck
const placeholders = Object.entries(deckCards).filter(([id]) => id !== ROW);
check('exactly one new deck row exists', placeholders.length === 1, `got ${placeholders.length}`);
const ph = placeholders[0]?.[1];
check('placeholder keeps scryfallId', ph?.scryfallId === SCRYFALL, `got ${ph?.scryfallId}`);
check('placeholder has no ownerId', ph?.entry.ownerId === undefined, `got ${ph?.entry.ownerId}`);
check('placeholder has deckId set', ph?.entry.deckId === DECK, `got ${ph?.entry.deckId}`);
check(
	'placeholder is in mainboard zone',
	ph?.entry.tags?.includes('deck:mainboard') === true,
	`got ${JSON.stringify(ph?.entry.tags)}`
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
