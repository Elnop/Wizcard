// Fixed showcase data. No runtime fetch — the landing must render
// deterministically and offline. Scryfall image URLs go through
// scryfallImageLoader (default UA is blocked on cards.scryfall.io).

export interface DemoCard {
	name: string;
	src: string;
}

// Verified normal-size Scryfall image URLs (resolved via the Scryfall API).
const LIGHTNING_BOLT: DemoCard = {
	name: 'Lightning Bolt',
	src: 'https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg',
};
const GOBLIN_GUIDE: DemoCard = {
	name: 'Goblin Guide',
	src: 'https://cards.scryfall.io/normal/front/3/c/3c0f5411-1940-410f-96ce-6f92513f753a.jpg',
};
const MONASTERY_SWIFTSPEAR: DemoCard = {
	name: 'Monastery Swiftspear',
	src: 'https://cards.scryfall.io/normal/front/d/6/d6bfa227-4309-40ed-952c-279595eab17e.jpg',
};
const SOL_RING: DemoCard = {
	name: 'Sol Ring',
	src: 'https://cards.scryfall.io/normal/front/9/1/91fdb56b-54d5-4272-8319-505ff987fe9b.jpg',
};
const COUNTERSPELL: DemoCard = {
	name: 'Counterspell',
	src: 'https://cards.scryfall.io/normal/front/4/f/4f616706-ec97-4923-bb1e-11a69fbaa1f8.jpg',
};
const LLANOWAR_ELVES: DemoCard = {
	name: 'Llanowar Elves',
	src: 'https://cards.scryfall.io/normal/front/6/a/6a0b230b-d391-4998-a3f7-7b158a0ec2cd.jpg',
};
const BIRDS_OF_PARADISE: DemoCard = {
	name: 'Birds of Paradise',
	src: 'https://cards.scryfall.io/normal/front/4/9/492c2f9a-51e7-4e0f-9899-23bf43ea988b.jpg',
};
const BRAINSTORM: DemoCard = {
	name: 'Brainstorm',
	src: 'https://cards.scryfall.io/normal/front/b/5/b5545882-6963-4729-b2c6-fb4bdc75ffcc.jpg',
};
const PATH_TO_EXILE: DemoCard = {
	name: 'Path to Exile',
	src: 'https://cards.scryfall.io/normal/front/9/5/95ca89ea-1200-4bb4-ae4b-af35d3ccd35b.jpg',
};

export interface DemoDeckCard extends DemoCard {
	cmc: number;
	colors: string[]; // WUBRG letters; [] = colorless
	type: 'Creature' | 'Instant' | 'Sorcery' | 'Artifact' | 'Land' | 'Enchantment' | 'Planeswalker';
}

// Gruul (red-green) aggro sample. Real MTG values so every derived stat is the
// deck's own. Verified against the Scryfall API on 2026-07-21.
export const DECK_SAMPLE: DemoDeckCard[] = [
	{ ...LLANOWAR_ELVES, cmc: 1, colors: ['G'], type: 'Creature' },
	{ ...BIRDS_OF_PARADISE, cmc: 1, colors: ['G'], type: 'Creature' },
	{ ...GOBLIN_GUIDE, cmc: 1, colors: ['R'], type: 'Creature' },
	{ ...MONASTERY_SWIFTSPEAR, cmc: 1, colors: ['R'], type: 'Creature' },
	{ ...LIGHTNING_BOLT, cmc: 1, colors: ['R'], type: 'Instant' },
	{
		name: 'Burning-Tree Emissary',
		src: 'https://cards.scryfall.io/normal/front/b/a/ba327a5e-bd57-4e24-b4b4-062202df30e1.jpg',
		cmc: 2,
		colors: ['G', 'R'],
		type: 'Creature',
	},
	{
		name: 'Domri Rade',
		src: 'https://cards.scryfall.io/normal/front/9/a/9a7a5bbc-9d5a-461b-a5d7-a3f2e9b383be.jpg',
		cmc: 3,
		colors: ['G', 'R'],
		type: 'Planeswalker',
	},
	{
		name: 'Bloodbraid Elf',
		src: 'https://cards.scryfall.io/normal/front/e/2/e2f12f6f-9383-47e6-a44f-2834ad130e51.jpg',
		cmc: 4,
		colors: ['G', 'R'],
		type: 'Creature',
	},
	{
		name: 'Glorybringer',
		src: 'https://cards.scryfall.io/normal/front/0/6/06f90d62-6d21-47b1-a427-eb25a42f4dcb.jpg',
		cmc: 5,
		colors: ['R'],
		type: 'Creature',
	},
];

const COLOR_HEX: Record<string, string> = {
	W: '#e9e4d0',
	U: '#3b7dd8',
	B: '#333',
	R: '#d33',
	G: '#4a9c5d',
	C: '#555', // colorless / no pips
};
const WUBRG = ['W', 'U', 'B', 'R', 'G'];

export function deckCurve(deck: DemoDeckCard[]): number[] {
	const curve = new Array<number>(7).fill(0);
	for (const c of deck) curve[Math.min(c.cmc, 6)] += 1;
	return curve;
}

function colorPips(deck: DemoDeckCard[]): Map<string, number> {
	const pips = new Map<string, number>();
	for (const c of deck) {
		for (const col of c.colors) pips.set(col, (pips.get(col) ?? 0) + 1);
	}
	return pips;
}

export function deckColorSlices(deck: DemoDeckCard[]): { color: string; pct: number }[] {
	const pips = colorPips(deck);
	const total = [...pips.values()].reduce((a, b) => a + b, 0);
	if (total === 0) return [];
	return WUBRG.filter((col) => pips.has(col)).map((col) => ({
		color: COLOR_HEX[col],
		pct: Math.round(((pips.get(col) ?? 0) / total) * 100),
	}));
}

export function deckTypeCounts(deck: DemoDeckCard[]): { type: string; count: number }[] {
	const order: string[] = [];
	const counts = new Map<string, number>();
	for (const c of deck) {
		if (!counts.has(c.type)) order.push(c.type);
		counts.set(c.type, (counts.get(c.type) ?? 0) + 1);
	}
	return order
		.map((type) => ({ type, count: counts.get(type) ?? 0 }))
		.sort((a, b) => b.count - a.count);
}

// Dominant color among cards in a cmc bucket, as a hex tint. Tie -> red (lead
// color of the Gruul archetype). Empty column -> null.
export function columnTint(deck: DemoDeckCard[], cmc: number): string | null {
	const pips = new Map<string, number>();
	for (const c of deck) {
		if (Math.min(c.cmc, 6) !== cmc) continue;
		for (const col of c.colors) pips.set(col, (pips.get(col) ?? 0) + 1);
	}
	if (pips.size === 0) return null;
	let best = 'R';
	let bestN = -1;
	for (const col of WUBRG) {
		const n = pips.get(col) ?? 0;
		if (n > bestN) {
			bestN = n;
			best = col;
		}
	}
	return COLOR_HEX[best];
}

export const SEARCH_CARDS: DemoCard[] = [LIGHTNING_BOLT, GOBLIN_GUIDE, MONASTERY_SWIFTSPEAR];

// Nine distinct cards for the collection fill grid and the PDF 3x3 sheet.
export const COLLECTION_CARDS: DemoCard[] = [
	LIGHTNING_BOLT,
	GOBLIN_GUIDE,
	MONASTERY_SWIFTSPEAR,
	SOL_RING,
	COUNTERSPELL,
	LLANOWAR_ELVES,
	BIRDS_OF_PARADISE,
	BRAINSTORM,
	PATH_TO_EXILE,
];

export const IMPORT_SOURCES: string[] = ['Moxfield', 'MTG Arena', 'CardNexus', 'Delver Lens'];

export const COLLECTION_TARGET = 1248;
export const IMPORT_RECOGNIZED = 60;
