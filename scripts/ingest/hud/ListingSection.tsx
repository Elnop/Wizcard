// LISTING DRIVE block (phase 0): single-colour @inkjs/ui ProgressBar.
// ProgressBar stretches to fill its parent, so it's wrapped in a fixed-width Box.

import React from 'react';
import { Box, Text } from 'ink';
import { ProgressBar } from '@inkjs/ui';
import type { HudState } from '../logger';
import { SectionLine } from './Section';
import { pct } from './format';

export function ListingSection({
	state,
	width,
}: {
	state: HudState;
	width: number;
}): React.ReactElement {
	const barWidth = Math.max(8, width - 22);
	const value =
		state.listingTotal > 0
			? Math.min(100, Math.round((state.listingDone / state.listingTotal) * 100))
			: 0;
	return (
		<Box flexDirection="column" flexShrink={0} marginBottom={1}>
			<SectionLine title="LISTING DRIVE" width={width} />
			<Box paddingLeft={1} width={barWidth + 1}>
				<ProgressBar value={value} />
			</Box>
			<Box paddingLeft={1}>
				<Text bold>{state.listingDone}</Text>
				<Text dimColor>
					{'/'}
					{state.listingTotal}
					{'  '}
					{pct(state.listingDone, state.listingTotal)}
					{'  sources listées'}
				</Text>
			</Box>
		</Box>
	);
}
