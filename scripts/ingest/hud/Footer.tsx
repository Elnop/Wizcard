// Bottom hint bar: event filters + navigation keys + active pane indicator.

import React from 'react';
import { Box, Text } from 'ink';
import { FILTER_LABELS, type FilterLevel } from './filter';
import type { PaneId } from './useFocusPane';

interface FooterProps {
	filter: FilterLevel;
	activePane: PaneId;
	cols: number;
}

export function Footer({ filter, activePane, cols }: FooterProps): React.ReactElement {
	const keys: FilterLevel[] = ['e', 'w', 'i', 'd'];
	const paneLabel = activePane === 'sources' ? 'sources' : 'events';
	return (
		<Box width={cols} marginTop={1}>
			<Text dimColor> </Text>
			{keys.map((k) => (
				<Text key={k} color={k === filter ? 'cyan' : undefined} dimColor={k !== filter}>
					{`${FILTER_LABELS[k]} `}
				</Text>
			))}
			<Text dimColor>{'│ '}</Text>
			<Text color="cyan">{`Tab:${paneLabel}`}</Text>
			<Text dimColor>{' ↑↓/PgUp/PgDn/gG:scroll · q:quit'}</Text>
		</Box>
	);
}
