'use client';

import { useState } from 'react';
import { ForgeRarityFilter } from './ForgeRarityFilter';

function Interactive() {
	const [value, setValue] = useState<string[]>([]);
	return <ForgeRarityFilter value={value} onChange={setValue} />;
}

export default { Interactive };
