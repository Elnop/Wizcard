'use client';

import { useFixtureInput } from 'react-cosmos/client';
import { ForgeSearchBar } from './ForgeSearchBar';

function Interactive() {
	const [value, setValue] = useFixtureInput('value', '');
	return <ForgeSearchBar value={value} onChange={setValue} />;
}

function WithValue() {
	const [value, setValue] = useFixtureInput('value', 'Lightning Bolt');
	return <ForgeSearchBar value={value} onChange={setValue} />;
}

export default { Interactive, 'With Value': WithValue };
