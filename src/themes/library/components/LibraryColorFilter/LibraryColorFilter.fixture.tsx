'use client';

import { useState } from 'react';
import { LibraryColorFilter } from './LibraryColorFilter';
import type { ManaColor } from '@/themes/_shared/types';

function Interactive() {
	const [selected, setSelected] = useState<ManaColor[]>([]);
	const [match, setMatch] = useState<'exact' | 'include' | 'atMost'>('include');
	return (
		<LibraryColorFilter
			selected={selected}
			onChange={setSelected}
			colorMatch={match}
			onColorMatchChange={setMatch}
		/>
	);
}

export default { Interactive };
