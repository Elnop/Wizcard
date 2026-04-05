'use client';

import { useFixtureSelect, useFixtureInput } from 'react-cosmos/client';
import { LibraryButton } from './LibraryButton';

function Interactive() {
	const [variant] = useFixtureSelect('variant', {
		options: ['primary', 'secondary', 'ghost', 'danger'],
	});
	const [size] = useFixtureSelect('size', { options: ['sm', 'md', 'lg'] });
	const [isLoading] = useFixtureInput('isLoading', false);
	const [disabled] = useFixtureInput('disabled', false);
	const [label] = useFixtureInput('label', 'Click me');

	return (
		<LibraryButton variant={variant} size={size} isLoading={isLoading} disabled={disabled}>
			{label}
		</LibraryButton>
	);
}

export default {
	Interactive,
	'All Variants': (
		<div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
			<LibraryButton variant="primary">Primary</LibraryButton>
			<LibraryButton variant="secondary">Secondary</LibraryButton>
			<LibraryButton variant="ghost">Ghost</LibraryButton>
			<LibraryButton variant="danger">Danger</LibraryButton>
		</div>
	),
	'All Sizes': (
		<div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
			<LibraryButton size="sm">Small</LibraryButton>
			<LibraryButton size="md">Medium</LibraryButton>
			<LibraryButton size="lg">Large</LibraryButton>
		</div>
	),
	Loading: <LibraryButton isLoading>Loading</LibraryButton>,
	Disabled: <LibraryButton disabled>Disabled</LibraryButton>,
};
