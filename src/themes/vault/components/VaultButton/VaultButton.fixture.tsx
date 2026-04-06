'use client';

import { useFixtureSelect, useFixtureInput } from 'react-cosmos-renderer/client';
import { VaultButton } from './VaultButton';

function Interactive() {
	const [variant] = useFixtureSelect('variant', {
		options: ['primary', 'secondary', 'ghost', 'danger'],
	});
	const [size] = useFixtureSelect('size', {
		options: ['sm', 'md', 'lg'],
	});
	const [isLoading] = useFixtureInput('isLoading', false);
	const [disabled] = useFixtureInput('disabled', false);
	const [label] = useFixtureInput('label', 'Click me');

	return (
		<VaultButton variant={variant} size={size} isLoading={isLoading} disabled={disabled}>
			{label}
		</VaultButton>
	);
}

const fixtures = {
	Interactive,
	'All Variants': (
		<div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
			<VaultButton variant="primary">Primary</VaultButton>
			<VaultButton variant="secondary">Secondary</VaultButton>
			<VaultButton variant="ghost">Ghost</VaultButton>
			<VaultButton variant="danger">Danger</VaultButton>
		</div>
	),
	'All Sizes': (
		<div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
			<VaultButton size="sm">Small</VaultButton>
			<VaultButton size="md">Medium</VaultButton>
			<VaultButton size="lg">Large</VaultButton>
		</div>
	),
	Loading: <VaultButton isLoading>Loading</VaultButton>,
	Disabled: <VaultButton disabled>Disabled</VaultButton>,
};

export default fixtures;
