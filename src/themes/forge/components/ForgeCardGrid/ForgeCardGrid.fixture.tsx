'use client';

import { ForgeCardGrid } from './ForgeCardGrid';
import { ForgeCardFrame } from '../ForgeCardFrame/ForgeCardFrame';
import { MOCK_CARDS } from '@/themes/_shared/mockData';

const MANA_GLOW: Record<string, string> = {
	C: 'var(--mana-colorless)',
	R: 'var(--mana-red)',
	U: 'var(--mana-blue)',
	W: 'var(--mana-white)',
	G: 'var(--mana-green)',
	B: 'var(--mana-black)',
};

export default {
	'Mana Glows': (
		<ForgeCardGrid columns={3}>
			{MOCK_CARDS.map((card) => (
				<ForgeCardFrame
					key={card.name}
					src={card.src}
					alt={card.name}
					width={220}
					height={307}
					glowColor={MANA_GLOW[card.mana]}
				/>
			))}
		</ForgeCardGrid>
	),
};
