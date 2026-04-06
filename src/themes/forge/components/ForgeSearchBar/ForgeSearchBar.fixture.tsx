'use client';

import { useFixtureInput } from 'react-cosmos-renderer/client';
import { ForgeSearchBar } from './ForgeSearchBar';

function Interactive() {
	const [value, setValue] = useFixtureInput('value', '');
	return <ForgeSearchBar value={value} onChange={setValue} />;
}

function WithValue() {
	const [value, setValue] = useFixtureInput('value', 'Lightning Bolt');
	return <ForgeSearchBar value={value} onChange={setValue} />;
}

const fixtures = { Interactive, 'With Value': WithValue };

export default fixtures;
