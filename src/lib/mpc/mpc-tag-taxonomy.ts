// src/lib/mpc/mpc-tag-taxonomy.ts

export interface MpcTagNode {
	label: string;
	children?: MpcTagNode[];
}

export interface MpcTagGroup {
	label: string;
	tags: MpcTagNode[];
}

export const MPC_TAG_GROUPS: MpcTagGroup[] = [
	{
		label: 'Art',
		tags: [
			{
				label: 'Altered Art',
				children: [{ label: 'Pixel Art' }, { label: 'Pop-Out Art' }, { label: 'Sketch Art' }],
			},
			{
				label: 'Custom Art',
				children: [
					{
						label: 'AI Art',
						children: [{ label: 'AI Remaster' }],
					},
					{ label: 'Artist Art' },
					{ label: 'Switched Art' },
				],
			},
			{ label: 'Upscaled Scan' },
		],
	},
	{
		label: 'Frame',
		tags: [
			{
				label: 'Borderless',
				children: [{ label: 'Post-2023 Borderless' }],
			},
			{
				label: 'Custom-Made Frame',
				children: [{ label: 'AI Frame' }, { label: 'Minimalist' }, { label: 'Stonecutter' }],
			},
			{ label: 'Extended-Art' },
			{ label: 'FNM Promo' },
			{ label: 'Foil-Etched' },
			{ label: 'Full Text' },
			{ label: 'Full-Art' },
			{ label: 'Futureshifted' },
			{ label: 'M15' },
			{ label: 'Modern' },
			{ label: 'Planeshifted' },
			{ label: 'Retro' },
			{
				label: 'Showcase',
				children: [
					{ label: 'Amonkhet Invocations' },
					{ label: 'Capenna Art Deco' },
					{ label: 'Capenna Golden Age' },
					{ label: 'Capenna Skyscraper' },
					{ label: 'ClassicShifted' },
					{ label: 'Commander Legends' },
					{ label: 'D&D Module' },
					{ label: 'D&D Sourcebook' },
					{ label: 'Doctor Who TARDIS' },
					{ label: 'Dominaria Stained Glass' },
					{ label: 'Eldraine Enchanting Tales' },
					{ label: 'Eldraine Storybook' },
					{ label: 'English Mystical Archive' },
					{ label: 'FCA Showcase' },
					{ label: 'Ikoria Crystal' },
					{ label: 'Innistrad Equinox' },
					{ label: 'Innistrad Fang' },
					{ label: 'Ixalan Coin' },
					{ label: 'Japanese Mystical Archive' },
					{ label: 'Japan Showcase' },
					{ label: 'Kaladesh Inventions' },
					{ label: 'Kaldheim Viking' },
					{ label: 'Kamigawa Neon' },
					{ label: 'Kamigawa Ninja' },
					{ label: 'Kamigawa Samurai' },
					{ label: 'LOTR Ring' },
					{ label: 'LOTR Scrolls of Middle-earth' },
					{ label: 'M21 Spellbook' },
					{ label: 'Phyrexia Oil' },
					{ label: 'Ravnica Architecture' },
					{ label: 'Sketch Frame' },
					{ label: 'Tarkir Dragon Wing' },
					{ label: 'Theros Nyx' },
					{ label: 'Universes Beyond' },
					{ label: 'Zendikar Expeditions' },
					{ label: 'Zendikar Hedron' },
					{ label: 'Zendikar Rising Expeditions' },
				],
			},
		],
	},
	{
		label: 'Misc',
		tags: [
			{
				label: 'Alternate Name',
				children: [{ label: 'Nickname' }],
			},
			{
				label: 'Card',
				children: [
					{ label: 'Eternal Night Card' },
					{ label: 'Realistic' },
					{ label: 'Secret Lair' },
					{ label: 'Textless' },
				],
			},
			{
				label: 'Non-Black Border',
				children: [{ label: 'Gold Border' }, { label: 'Silver Border' }, { label: 'White Border' }],
			},
			{ label: 'NSFW' },
		],
	},
	{
		label: 'Universe',
		tags: [
			{
				label: 'Anime',
				children: [{ label: 'Hatsune Miku' }],
			},
			{ label: 'Avatar The Last Airbender' },
			{ label: 'Dr Who' },
			{ label: 'Fallout' },
			{ label: 'Final Fantasy' },
			{ label: 'In-Multiverse' },
			{ label: 'League of Legends' },
			{ label: 'Lord of the Rings' },
			{ label: 'My Little Pony' },
			{ label: 'Spider-Man' },
			{ label: 'Warhammer 40k' },
		],
	},
];
