import type { CardLayoutDefinition, CardLayoutId } from './types';

export const CARD_LAYOUTS: Record<CardLayoutId, CardLayoutDefinition> = {
	arcana: {
		id: 'arcana',
		labelKey: 'arcana',
		descriptionKey: 'arcana',
		orientation: 'portrait',
		geometry: {
			width: 744,
			height: 1039,
			art: { x: 57, y: 119, width: 630, height: 459 },
			title: { x: 61, y: 54, width: 468, height: 55 },
			mana: { x: 523, y: 54, width: 163, height: 55 },
			typeLine: { x: 57, y: 584, width: 630, height: 53 },
			rules: { x: 57, y: 644, width: 630, height: 294 },
			stats: { x: 568, y: 910, width: 119, height: 56 },
			footer: { x: 57, y: 964, width: 630, height: 28 },
		},
	},
	modern: {
		id: 'modern',
		labelKey: 'modern',
		descriptionKey: 'modern',
		orientation: 'portrait',
		geometry: {
			width: 744,
			height: 1039,
			art: { x: 45, y: 121, width: 654, height: 472 },
			title: { x: 51, y: 56, width: 474, height: 55 },
			mana: { x: 519, y: 56, width: 176, height: 55 },
			typeLine: { x: 45, y: 599, width: 654, height: 52 },
			rules: { x: 45, y: 658, width: 654, height: 280 },
			stats: { x: 575, y: 910, width: 124, height: 56 },
			footer: { x: 45, y: 964, width: 654, height: 28 },
		},
	},
	'full-art': {
		id: 'full-art',
		labelKey: 'full-art',
		descriptionKey: 'full-art',
		orientation: 'portrait',
		geometry: {
			width: 744,
			height: 1039,
			art: { x: 18, y: 18, width: 708, height: 1003 },
			title: { x: 52, y: 64, width: 494, height: 56 },
			mana: { x: 544, y: 64, width: 148, height: 56 },
			typeLine: { x: 52, y: 615, width: 640, height: 48 },
			rules: { x: 52, y: 675, width: 640, height: 238 },
			stats: { x: 556, y: 886, width: 136, height: 62 },
			footer: { x: 52, y: 958, width: 640, height: 30 },
		},
	},
	showcase: {
		id: 'showcase',
		labelKey: 'showcase',
		descriptionKey: 'showcase',
		orientation: 'portrait',
		geometry: {
			width: 744,
			height: 1039,
			art: { x: 28, y: 126, width: 688, height: 500 },
			title: { x: 66, y: 62, width: 478, height: 54 },
			mana: { x: 542, y: 62, width: 142, height: 54 },
			typeLine: { x: 82, y: 626, width: 582, height: 46 },
			rules: { x: 82, y: 686, width: 582, height: 222 },
			stats: { x: 532, y: 886, width: 132, height: 60 },
			footer: { x: 82, y: 956, width: 582, height: 30 },
		},
	},
	token: {
		id: 'token',
		labelKey: 'token',
		descriptionKey: 'token',
		orientation: 'portrait',
		geometry: {
			width: 744,
			height: 1039,
			art: { x: 32, y: 132, width: 680, height: 602 },
			title: { x: 58, y: 65, width: 488, height: 52 },
			mana: { x: 544, y: 65, width: 142, height: 52 },
			typeLine: { x: 70, y: 748, width: 604, height: 48 },
			rules: { x: 70, y: 810, width: 604, height: 100 },
			stats: { x: 542, y: 884, width: 132, height: 62 },
			footer: { x: 70, y: 957, width: 604, height: 30 },
		},
	},
	planeswalker: {
		id: 'planeswalker',
		labelKey: 'planeswalker',
		descriptionKey: 'planeswalker',
		orientation: 'portrait',
		geometry: {
			width: 744,
			height: 1039,
			art: { x: 40, y: 132, width: 664, height: 430 },
			title: { x: 56, y: 63, width: 490, height: 52 },
			mana: { x: 544, y: 63, width: 144, height: 52 },
			typeLine: { x: 56, y: 520, width: 632, height: 47 },
			rules: { x: 56, y: 583, width: 632, height: 326 },
			stats: { x: 574, y: 880, width: 114, height: 68 },
			footer: { x: 56, y: 958, width: 632, height: 30 },
		},
	},
	saga: {
		id: 'saga',
		labelKey: 'saga',
		descriptionKey: 'saga',
		orientation: 'portrait',
		geometry: {
			width: 744,
			height: 1039,
			art: { x: 34, y: 128, width: 300, height: 802 },
			title: { x: 54, y: 62, width: 492, height: 52 },
			mana: { x: 544, y: 62, width: 144, height: 52 },
			typeLine: { x: 358, y: 128, width: 350, height: 52 },
			rules: { x: 358, y: 192, width: 350, height: 738 },
			stats: { x: 0, y: 0, width: 0, height: 0 },
			footer: { x: 42, y: 956, width: 660, height: 30 },
		},
	},
	adventure: {
		id: 'adventure',
		labelKey: 'adventure',
		descriptionKey: 'adventure',
		orientation: 'portrait',
		geometry: {
			width: 744,
			height: 1039,
			art: { x: 44, y: 132, width: 656, height: 448 },
			title: { x: 58, y: 64, width: 488, height: 52 },
			mana: { x: 544, y: 64, width: 142, height: 52 },
			typeLine: { x: 58, y: 590, width: 628, height: 46 },
			rules: { x: 230, y: 652, width: 456, height: 254 },
			stats: { x: 552, y: 885, width: 134, height: 62 },
			footer: { x: 58, y: 957, width: 628, height: 30 },
		},
	},
	landscape: {
		id: 'landscape',
		labelKey: 'landscape',
		descriptionKey: 'landscape',
		orientation: 'landscape',
		geometry: {
			width: 1039,
			height: 744,
			art: { x: 38, y: 124, width: 556, height: 528 },
			title: { x: 54, y: 50, width: 690, height: 54 },
			mana: { x: 742, y: 50, width: 244, height: 54 },
			typeLine: { x: 614, y: 124, width: 383, height: 48 },
			rules: { x: 614, y: 188, width: 383, height: 390 },
			stats: { x: 854, y: 566, width: 143, height: 64 },
			footer: { x: 614, y: 652, width: 383, height: 30 },
		},
	},
};

// Landscape remains readable for older saved drafts, but the Studio only offers
// standard 63 × 88 mm portrait cards. Horizontal experiments looked like UI
// panels rather than collectible cards and are intentionally not discoverable.
export const CARD_LAYOUT_LIST = Object.values(CARD_LAYOUTS).filter(
	(layout) => layout.id !== 'landscape'
);

export function getCardLayout(id: CardLayoutId): CardLayoutDefinition {
	return CARD_LAYOUTS[id];
}
