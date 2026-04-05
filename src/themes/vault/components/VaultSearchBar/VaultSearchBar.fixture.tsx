'use client';

import { useFixtureInput } from 'react-cosmos/client';
import { VaultSearchBar } from './VaultSearchBar';

function Interactive() {
	const [value, setValue] = useFixtureInput('value', '');
	return <VaultSearchBar value={value} onChange={setValue} />;
}

function WithValue() {
	const [value, setValue] = useFixtureInput('value', 'Black Lotus');
	return <VaultSearchBar value={value} onChange={setValue} />;
}

export default {
	Interactive,
	'With Value': WithValue,
	'Custom Placeholder': function CustomPlaceholder() {
		const [value, setValue] = useFixtureInput('value', '');
		return <VaultSearchBar value={value} onChange={setValue} placeholder="Search the vault..." />;
	},
};
