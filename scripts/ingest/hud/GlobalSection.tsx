// GLOBAL block: overall segmented progress + counters + ETA/speed + warn/error badges.

import React from 'react';
import { Box, Text } from 'ink';
import { Badge } from '@inkjs/ui';
import type { HudState } from '../logger';
import { SectionLine } from './Section';
import { SegmentedBar } from './SegmentedBar';
import { fmtEta, fmtElapsed, pct } from './format';

export function GlobalSection({
	state,
	width,
}: {
	state: HudState;
	width: number;
}): React.ReactElement {
	const barWidth = Math.max(8, width - 22);
	const globalOk = Math.max(0, state.globalDone - state.globalSkipped - state.globalFailed);
	const speedStr = state.cardsPerSec !== null ? `${state.cardsPerSec}/s` : '—/s';
	const elapsedStr = state.startedAt > 0 ? fmtElapsed(state.startedAt) : '';

	return (
		<Box flexDirection="column" marginBottom={1} flexShrink={0}>
			<SectionLine title="GLOBAL" width={width} />
			<Box paddingLeft={1}>
				<SegmentedBar
					skipped={state.globalSkipped}
					stale={state.globalStale}
					ok={globalOk}
					failed={state.globalFailed}
					of={state.globalTotal}
					width={barWidth}
				/>
			</Box>
			<Box paddingLeft={1}>
				<Text bold>{state.globalDone.toLocaleString()}</Text>
				<Text dimColor>
					{'/'}
					{state.globalTotal.toLocaleString()}
					{'  '}
					{pct(state.globalDone, state.globalTotal)}
				</Text>
			</Box>
			<Box paddingLeft={1}>
				<Text dimColor>
					{fmtEta(state.etaSeconds)}
					{'  '}
					{elapsedStr ? `${elapsedStr}  ` : ''}
					{speedStr}
				</Text>
			</Box>
			<Box paddingLeft={1}>
				<Text dimColor>
					{'new '}
					{state.newCount}
					{'  skip '}
					{state.skipCount}
					{'  '}
				</Text>
				{state.warningTotal > 0 ? <Badge color="yellow">{`⚠${state.warningTotal}`}</Badge> : null}
				{state.errorTotal > 0 ? (
					<Box marginLeft={1}>
						<Badge color="red">{`✗${state.errorTotal}`}</Badge>
					</Box>
				) : null}
			</Box>
		</Box>
	);
}
