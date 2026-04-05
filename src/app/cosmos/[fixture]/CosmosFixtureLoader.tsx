'use client';

import { Suspense } from 'react';
import { decodeRendererUrlFixture } from 'react-cosmos-core';
import { ClientFixtureLoader } from 'react-cosmos-renderer/client';
import { rendererConfig, moduleWrappers } from '../../../../cosmos.imports';
import { NextRendererProvider } from 'react-cosmos-next/dist/NextRendererProvider.js';

export function CosmosFixtureLoader({ fixture }: { fixture: string }) {
	const fixtureId =
		fixture && fixture !== 'index' ? decodeRendererUrlFixture(decodeURIComponent(fixture)) : null;

	const selectedFixture = fixtureId ? { fixtureId, initialFixtureState: {}, renderKey: 0 } : null;

	return (
		<Suspense>
			<NextRendererProvider rendererConfig={rendererConfig} selectedFixture={selectedFixture}>
				<ClientFixtureLoader moduleWrappers={moduleWrappers} />
			</NextRendererProvider>
		</Suspense>
	);
}
