import { useCollectionStore } from './collection-store';

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

const store = useCollectionStore.getState();
const card = { id: 'sf-1' } as { id: string };
let synced = 0;

useCollectionStore.setState({ entries: {} });
store.addCards(card as never, 3, 'user-1', () => synced++, { condition: 'NM' });

const entries = Object.values(useCollectionStore.getState().entries);
check('3 entries added to state', entries.length === 3);
check('3 distinct rowIds', new Set(Object.keys(useCollectionStore.getState().entries)).size === 3);
check(
	'all carry scryfallId',
	entries.every((e) => e.scryfallId === 'sf-1')
);
check(
	'patch applied',
	entries.every((e) => e.entry.condition === 'NM')
);
check('triggerSync called once', synced === 1);

// clamp delegated to buildEntriesBatch: count 0 → 1 entry
useCollectionStore.setState({ entries: {} });
store.addCards(card as never, 0, 'user-1', () => {}, undefined);
check('count 0 → 1 entry', Object.keys(useCollectionStore.getState().entries).length === 1);

// No userId → optimistic state still updated, triggerSync NOT called
useCollectionStore.setState({ entries: {} });
let synced2 = 0;
store.addCards(card as never, 2, null, () => synced2++, undefined);
check(
	'no-user: 2 entries in state',
	Object.keys(useCollectionStore.getState().entries).length === 2
);
check('no-user: triggerSync not called', synced2 === 0);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
