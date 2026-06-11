// Top banner: ◆ Wizcard Ingest · flags · elapsed.

import React from 'react';
import { Box, Text } from 'ink';
import type { HudState } from '../logger';
import { fmtElapsed } from './format';

export function Header({ state, cols }: { state: HudState; cols: number }): React.ReactElement {
	const { scryfall, mirror, fuzzy, reEnrich, sources } = state.flags;
	const parts = [
		`${sources} source${sources !== 1 ? 's' : ''}`,
		scryfall ? 'Scryfall ON' : 'Scryfall OFF',
		mirror ? 'mirror ON' : null,
		fuzzy ? null : 'no-fuzzy',
		reEnrich ? 're-enrich ON' : null,
	]
		.filter(Boolean)
		.join('  ·  ');
	const elapsed = state.startedAt > 0 ? `  ·  ${fmtElapsed(state.startedAt)}` : '';
	return (
		<Box marginBottom={1} width={cols}>
			<Text bold color="cyan">
				◆ Wizcard Ingest
			</Text>
			<Text dimColor>
				{'  ·  '}
				{parts}
				{elapsed}
			</Text>
		</Box>
	);
}
