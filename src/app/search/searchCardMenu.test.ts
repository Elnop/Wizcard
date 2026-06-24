import { buildSearchMenuItems } from './searchCardMenu';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';

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

const noop = () => {};
const handlers = {
	onViewDetails: noop,
	onOpenCardPage: noop,
	onAddToCollection: noop,
	onAddToWishlist: noop,
};

// Official Scryfall card: no `source_type` / `card_type` discriminators.
const officialCard = { id: 'abc', name: 'Sol Ring' } as unknown as AnyCard;
const officialItems = buildSearchMenuItems(officialCard, handlers, noop);
const officialActions = officialItems.filter((i) => i.type === 'action');
check('official: 4 actions', officialActions.length === 4);
check('official: 1 divider', officialItems.filter((i) => i.type === 'divider').length === 1);
check(
	'official: first action is view details',
	officialItems[0].type === 'action' && officialItems[0].label === 'Voir les détails'
);

// Custom card: `object === 'custom_card'` makes isCustomCard return true.
const customCard = {
	id: 'def',
	name: 'My Token',
	source_type: 'mpc',
	card_type: 'token',
	object: 'custom_card',
} as unknown as AnyCard;
const customItems = buildSearchMenuItems(customCard, handlers, noop);
check('custom: only 1 item', customItems.length === 1);
check(
	'custom: that item is view details',
	customItems[0].type === 'action' && customItems[0].label === 'Voir les détails'
);

// close() is called after a handler runs.
let closed = false;
let viewed = false;
const items = buildSearchMenuItems(
	officialCard,
	{ ...handlers, onViewDetails: () => (viewed = true) },
	() => (closed = true)
);
const first = items[0];
if (first.type === 'action') first.onClick();
check('view details onClick calls handler', viewed);
check('view details onClick calls close', closed);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
