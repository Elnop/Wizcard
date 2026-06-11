// SCRYFALL ENRICH block: one segmented bar showing enrichment status proportions
// across all sources (green=resolved, yellow=unresolved, red=failed, dim=remaining)
// plus done/total + % and counters. Modeled on GlobalSection; reuses SegmentedBar.

import React from 'react';
import { Box, Text } from 'ink';
import type { HudState } from '../logger';
import { SectionLine } from './Section';
import { SegmentedBar } from './SegmentedBar';
import { pct } from './format';

export function ScryfallSection({
	state,
	width,
}: {
	state: HudState;
	width: number;
}): React.ReactElement {
	const barWidth = Math.max(8, width - 22);
	return (
		<Box flexDirection="column" marginBottom={1} flexShrink={0}>
			<SectionLine title="SCRYFALL ENRICH" width={width} />
			<Box paddingLeft={1}>
				<SegmentedBar
					skipped={0}
					stale={state.enrichUnresolved}
					ok={state.enrichResolved}
					failed={state.enrichFailed}
					of={state.enrichTotal}
					width={barWidth}
				/>
			</Box>
			<Box paddingLeft={1}>
				<Text bold>{state.enrichDone.toLocaleString()}</Text>
				<Text dimColor>
					{'/'}
					{state.enrichTotal.toLocaleString()}
					{'  '}
					{pct(state.enrichDone, state.enrichTotal)}
				</Text>
			</Box>
			<Box paddingLeft={1}>
				<Text dimColor>
					{'resolved '}
					{state.enrichResolved}
					{'  unresolved '}
					{state.enrichUnresolved}
					{state.enrichFailed > 0 ? `  failed ${state.enrichFailed}` : ''}
				</Text>
			</Box>
		</Box>
	);
}
