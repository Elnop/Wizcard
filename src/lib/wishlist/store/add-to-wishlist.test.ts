import { useWishlistStore } from './wishlist-store';

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

const store = useWishlistStore.getState();
const card = { id: 'sf-9' } as { id: string };
let synced = 0;

// count = 3 → 3 entries
useWishlistStore.setState({ entries: {} });
store.addToWishlist(card as never, 'user-1', () => synced++, { condition: 'LP' }, 3);

const entries = Object.values(useWishlistStore.getState().entries);
check('3 entries added', entries.length === 3);
check('3 distinct rowIds', new Set(Object.keys(useWishlistStore.getState().entries)).size === 3);
check(
	'all carry scryfallId',
	entries.every((e) => e.scryfallId === 'sf-9')
);
check(
	'patch applied',
	entries.every((e) => e.entry.condition === 'LP')
);
check('triggerSync called once', synced === 1);

// default count (backward-compatible 4-arg call) → 1 entry
useWishlistStore.setState({ entries: {} });
store.addToWishlist(card as never, 'user-1', () => {}, { condition: 'NM' });
check('default count → 1 entry', Object.keys(useWishlistStore.getState().entries).length === 1);

// no userId → state updated, triggerSync not called
useWishlistStore.setState({ entries: {} });
let synced2 = 0;
store.addToWishlist(card as never, null, () => synced2++, undefined, 2);
check('no-user: 2 entries', Object.keys(useWishlistStore.getState().entries).length === 2);
check('no-user: triggerSync not called', synced2 === 0);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
