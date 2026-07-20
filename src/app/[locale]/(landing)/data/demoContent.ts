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

// Seven cards for the opening hand.
export const HAND_CARDS: DemoCard[] = [
	LIGHTNING_BOLT,
	GOBLIN_GUIDE,
	MONASTERY_SWIFTSPEAR,
	SOL_RING,
	COUNTERSPELL,
	LLANOWAR_ELVES,
	BIRDS_OF_PARADISE,
];

export const MANA_CURVE: number[] = [2, 6, 9, 7, 4, 2, 1]; // cmc 0..6+

export const COLOR_SLICES: { color: string; pct: number }[] = [
	{ color: '#d33', pct: 55 },
	{ color: '#333', pct: 20 },
	{ color: '#c9a84c', pct: 25 },
];

export const IMPORT_SOURCES: string[] = ['Moxfield', 'MTG Arena', 'CardNexus', 'Delver Lens'];

export const COLLECTION_TARGET = 1248;
export const IMPORT_RECOGNIZED = 60;
