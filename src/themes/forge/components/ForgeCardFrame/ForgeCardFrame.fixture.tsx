'use client';

import { ForgeCardFrame } from './ForgeCardFrame';
import { MOCK_CARDS } from '@/themes/_shared/mockData';

export default {
	'Default Glow': <ForgeCardFrame src={MOCK_CARDS[0].src} alt={MOCK_CARDS[0].name} />,
	'Red Glow': (
		<ForgeCardFrame src={MOCK_CARDS[1].src} alt={MOCK_CARDS[1].name} glowColor="var(--mana-red)" />
	),
	'Blue Glow': (
		<ForgeCardFrame src={MOCK_CARDS[2].src} alt={MOCK_CARDS[2].name} glowColor="var(--mana-blue)" />
	),
};
