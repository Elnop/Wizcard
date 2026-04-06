'use client';

import { useFixtureSelect, useFixtureInput } from 'react-cosmos-renderer/client';
import { ForgeButton } from './ForgeButton';

function Interactive() {
	const [variant] = useFixtureSelect('variant', {
		options: ['primary', 'secondary', 'ghost', 'danger'],
	});
	const [size] = useFixtureSelect('size', { options: ['sm', 'md', 'lg'] });
	const [isLoading] = useFixtureInput('isLoading', false);
	const [disabled] = useFixtureInput('disabled', false);
	const [label] = useFixtureInput('label', 'Click me');

	return (
		<ForgeButton variant={variant} size={size} isLoading={isLoading} disabled={disabled}>
			{label}
		</ForgeButton>
	);
}

const fixtures = {
	Interactive,
	'All Variants': (
		<div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
			<ForgeButton variant="primary">Primary</ForgeButton>
			<ForgeButton variant="secondary">Secondary</ForgeButton>
			<ForgeButton variant="ghost">Ghost</ForgeButton>
			<ForgeButton variant="danger">Danger</ForgeButton>
		</div>
	),
	'All Sizes': (
		<div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
			<ForgeButton size="sm">Small</ForgeButton>
			<ForgeButton size="md">Medium</ForgeButton>
			<ForgeButton size="lg">Large</ForgeButton>
		</div>
	),
	Loading: <ForgeButton isLoading>Loading</ForgeButton>,
	Disabled: <ForgeButton disabled>Disabled</ForgeButton>,
};

export default fixtures;
