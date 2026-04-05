'use client';

import { VaultCardFrame } from './VaultCardFrame';
import { MOCK_CARDS } from '@/themes/_shared/mockData';

export default {
	'Single Card': <VaultCardFrame src={MOCK_CARDS[0].src} alt={MOCK_CARDS[0].name} />,
	'Clickable Card': (
		<VaultCardFrame
			src={MOCK_CARDS[1].src}
			alt={MOCK_CARDS[1].name}
			onClick={() => alert('Card clicked!')}
		/>
	),
	'Small Card': (
		<VaultCardFrame src={MOCK_CARDS[2].src} alt={MOCK_CARDS[2].name} width={146} height={204} />
	),
};
