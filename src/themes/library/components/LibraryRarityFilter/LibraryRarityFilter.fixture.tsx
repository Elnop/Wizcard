'use client';

import { useState } from 'react';
import { LibraryRarityFilter } from './LibraryRarityFilter';

function Interactive() {
	const [value, setValue] = useState<string[]>([]);
	return <LibraryRarityFilter value={value} onChange={setValue} />;
}

export default { Interactive };
