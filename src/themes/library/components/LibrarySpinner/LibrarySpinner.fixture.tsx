'use client';

import { LibrarySpinner } from './LibrarySpinner';

export default {
	'All Sizes': (
		<div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
			<LibrarySpinner size="sm" />
			<LibrarySpinner size="md" />
			<LibrarySpinner size="lg" />
		</div>
	),
};
