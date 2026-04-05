'use client';

import { ForgeSpinner } from './ForgeSpinner';

export default {
	'All Sizes': (
		<div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
			<ForgeSpinner size="sm" />
			<ForgeSpinner size="md" />
			<ForgeSpinner size="lg" />
		</div>
	),
};
