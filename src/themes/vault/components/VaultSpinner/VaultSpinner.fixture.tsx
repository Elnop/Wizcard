'use client';

import { VaultSpinner } from './VaultSpinner';

export default {
	Small: <VaultSpinner size="sm" />,
	Medium: <VaultSpinner size="md" />,
	Large: <VaultSpinner size="lg" />,
	'All Sizes': (
		<div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
			<VaultSpinner size="sm" />
			<VaultSpinner size="md" />
			<VaultSpinner size="lg" />
		</div>
	),
};
