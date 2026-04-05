export const MOCK_CARDS = [
	{
		name: 'Black Lotus',
		src: 'https://cards.scryfall.io/normal/front/b/d/bd8fa327-dd41-4737-8f19-2cf5eb1f7cdd.jpg',
		mana: 'C' as const,
	},
	{
		name: 'Lightning Bolt',
		src: 'https://cards.scryfall.io/normal/front/7/7/77c6fa74-5543-42ac-9ead-0e890b188e99.jpg',
		mana: 'R' as const,
	},
	{
		name: 'Counterspell',
		src: 'https://cards.scryfall.io/normal/front/4/f/4f616706-ec97-4923-bb1e-11a69fbaa1f8.jpg',
		mana: 'U' as const,
	},
	{
		name: 'Sol Ring',
		src: 'https://cards.scryfall.io/normal/front/8/7/870ec754-a76c-40ea-9b81-81b3dca1f62c.jpg',
		mana: 'C' as const,
	},
	{
		name: 'Swords to Plowshares',
		src: 'https://cards.scryfall.io/normal/front/6/8/68ec2aed-7662-48ae-ab25-04f74ece1e41.jpg',
		mana: 'W' as const,
	},
	{
		name: 'Llanowar Elves',
		src: 'https://cards.scryfall.io/normal/front/6/a/6a0b230b-d391-4998-a3f7-7b158a0ec2cd.jpg',
		mana: 'G' as const,
	},
];

export const SHOWCASE_SECTIONS = [
	{
		title: 'Legendary Staples',
		cards: [
			{
				name: 'Black Lotus',
				src: 'https://cards.scryfall.io/normal/front/b/d/bd8fa327-dd41-4737-8f19-2cf5eb1f7cdd.jpg',
			},
			{
				name: 'Sol Ring',
				src: 'https://cards.scryfall.io/normal/front/8/7/870ec754-a76c-40ea-9b81-81b3dca1f62c.jpg',
			},
			{
				name: 'Mana Crypt',
				src: 'https://cards.scryfall.io/normal/front/4/d/4d960186-4559-4af0-bd22-63baa15f8939.jpg',
			},
			{
				name: 'Jace, the Mind Sculptor',
				src: 'https://cards.scryfall.io/normal/front/c/8/c8817585-0d32-4d56-9142-0d29512e86a9.jpg',
			},
			{
				name: 'Force of Will',
				src: 'https://cards.scryfall.io/normal/front/8/9/89f612d6-7c59-4a7b-a87d-45f789e88ba5.jpg',
			},
			{
				name: 'Demonic Tutor',
				src: 'https://cards.scryfall.io/normal/front/a/2/a24b4cb6-cebb-428b-8654-74347a6a8d63.jpg',
			},
			{
				name: 'Liliana of the Veil',
				src: 'https://cards.scryfall.io/normal/front/d/1/d12c8c97-6491-452c-811d-943441a7ef9f.jpg',
			},
			{
				name: 'Snapcaster Mage',
				src: 'https://cards.scryfall.io/normal/front/7/e/7e41765e-43fe-461d-baeb-ee30d13d2d93.jpg',
			},
			{
				name: 'Tarmogoyf',
				src: 'https://cards.scryfall.io/normal/front/6/9/69daba76-96e8-4bcc-ab79-2f00189ad8fb.jpg',
			},
		],
	},
	{
		title: 'Modern Classics',
		cards: [
			{
				name: 'Lightning Bolt',
				src: 'https://cards.scryfall.io/normal/front/7/7/77c6fa74-5543-42ac-9ead-0e890b188e99.jpg',
			},
			{
				name: 'Counterspell',
				src: 'https://cards.scryfall.io/normal/front/4/f/4f616706-ec97-4923-bb1e-11a69fbaa1f8.jpg',
			},
			{
				name: 'Swords to Plowshares',
				src: 'https://cards.scryfall.io/normal/front/6/8/68ec2aed-7662-48ae-ab25-04f74ece1e41.jpg',
			},
			{
				name: 'Brainstorm',
				src: 'https://cards.scryfall.io/normal/front/8/b/8beb987c-1b67-4a4e-ae71-58547afad2a0.jpg',
			},
			{
				name: 'Path to Exile',
				src: 'https://cards.scryfall.io/normal/front/9/0/90b690f4-9647-4e67-b7cb-b2692ea149b1.jpg',
			},
			{
				name: 'Dark Confidant',
				src: 'https://cards.scryfall.io/normal/front/2/5/2520ab23-a068-4462-b261-2754409b4108.jpg',
			},
			{
				name: 'Noble Hierarch',
				src: 'https://cards.scryfall.io/normal/front/4/0/400382a4-aea2-4827-b06a-1b0b3745908b.jpg',
			},
			{
				name: 'Stoneforge Mystic',
				src: 'https://cards.scryfall.io/normal/front/4/d/4d3473d0-b46f-41f5-ac1e-ba217f7747d4.jpg',
			},
			{
				name: 'Ragavan, Nimble Pilferer',
				src: 'https://cards.scryfall.io/normal/front/a/9/a9738cda-adb1-47fb-9f4c-ecd930228c4d.jpg',
			},
		],
	},
];

export const MANA_COLORS = [
	{ id: 'W' as const, name: 'White', color: '#f8e7b9' },
	{ id: 'U' as const, name: 'Blue', color: '#0e68ab' },
	{ id: 'B' as const, name: 'Black', color: '#150b00' },
	{ id: 'R' as const, name: 'Red', color: '#d3202a' },
	{ id: 'G' as const, name: 'Green', color: '#00733e' },
	{ id: 'C' as const, name: 'Colorless', color: '#ccc2c0' },
];

export const FEATURES = [
	{
		icon: '🔍',
		title: 'Instant Search',
		description: 'Search through every Magic card ever printed with lightning-fast results.',
	},
	{
		icon: '🎯',
		title: 'Advanced Filters',
		description: 'Filter by color, type, set, rarity, mana cost, and oracle text.',
	},
	{
		icon: '📦',
		title: 'Collection Management',
		description: 'Track every card you own with condition, foil status, and language.',
	},
	{
		icon: '📥',
		title: 'Import from Anywhere',
		description: 'Import your collection from Moxfield, MTG Arena, or CSV files.',
	},
	{
		icon: '☁️',
		title: 'Cloud Sync',
		description: 'Your collection syncs across all your devices in real-time.',
	},
];
