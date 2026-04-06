'use client';

import { useFixtureInput } from 'react-cosmos-renderer/client';
import { LibrarySearchBar } from './LibrarySearchBar';

function Interactive() {
	const [value, setValue] = useFixtureInput('value', '');
	return <LibrarySearchBar value={value} onChange={setValue} />;
}

function WithValue() {
	const [value, setValue] = useFixtureInput('value', 'Counterspell');
	return <LibrarySearchBar value={value} onChange={setValue} />;
}

const fixtures = { Interactive, 'With Value': WithValue };

export default fixtures;
