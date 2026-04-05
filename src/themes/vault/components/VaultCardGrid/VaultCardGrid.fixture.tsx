'use client';

import { VaultCardGrid } from './VaultCardGrid';
import { VaultCardFrame } from '../VaultCardFrame/VaultCardFrame';
import { MOCK_CARDS } from '@/themes/_shared/mockData';

export default {
	'4 Columns': (
		<VaultCardGrid columns={4}>
			{MOCK_CARDS.map((card) => (
				<VaultCardFrame key={card.name} src={card.src} alt={card.name} width={220} height={307} />
			))}
		</VaultCardGrid>
	),
	'3 Columns': (
		<VaultCardGrid columns={3}>
			{MOCK_CARDS.slice(0, 3).map((card) => (
				<VaultCardFrame key={card.name} src={card.src} alt={card.name} width={220} height={307} />
			))}
		</VaultCardGrid>
	),
};
