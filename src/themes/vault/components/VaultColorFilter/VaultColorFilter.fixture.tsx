'use client';

import { useState } from 'react';
import { VaultColorFilter } from './VaultColorFilter';
import type { ManaColor } from '@/themes/_shared/types';

function Interactive() {
	const [selected, setSelected] = useState<ManaColor[]>([]);
	const [match, setMatch] = useState<'exact' | 'include' | 'atMost'>('include');

	return (
		<VaultColorFilter
			selected={selected}
			onChange={setSelected}
			colorMatch={match}
			onColorMatchChange={setMatch}
		/>
	);
}

function Preselected() {
	const [selected, setSelected] = useState<ManaColor[]>(['W', 'U']);
	const [match, setMatch] = useState<'exact' | 'include' | 'atMost'>('exact');

	return (
		<VaultColorFilter
			selected={selected}
			onChange={setSelected}
			colorMatch={match}
			onColorMatchChange={setMatch}
		/>
	);
}

export default { Interactive, Preselected };
