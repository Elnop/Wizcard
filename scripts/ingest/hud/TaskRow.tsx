// One source row: status indicator + label + segmented bar + fail badge + done time.
//   • waiting     → dim ○ (listed, not yet picked up for processing)
//   • processing  → animated <Spinner> (or yellow ⟳ if it already has failures)
//   • finished    → <Badge> ✓ (green, or yellow when some cards failed)

import React from 'react';
import { Box, Text } from 'ink';
import { Spinner, Badge } from '@inkjs/ui';
import type { TaskHudState } from '../logger';
import { SegmentedBar } from './SegmentedBar';
import { fmtLabel, fmtClock, pct } from './format';

export function TaskRow({
	task,
	width,
}: {
	task: TaskHudState;
	width: number;
}): React.ReactElement {
	const barWidth = Math.max(4, width - 32);
	const isFinished = task.finishedAt !== undefined;
	const isProcessing = !isFinished && task.activatedAt !== undefined;
	const labelLen = Math.max(8, width - barWidth - 16);
	const label = fmtLabel(task.label, labelLen);
	const doneAt = isFinished
		? ` ${fmtClock(task.finishedAt!)}`
		: ` ${pct(task.done, task.of).padStart(4)}`;

	// All indicators must render as a single cell so labels stay aligned across
	// rows. Badge adds padding/background, so use a plain colored glyph instead.
	let indicator: React.ReactElement;
	if (isFinished) {
		indicator = <Text color={task.failed > 0 ? 'yellow' : 'green'}>✓</Text>;
	} else if (isProcessing) {
		indicator = task.failed > 0 ? <Text color="yellow">⟳</Text> : <Spinner />;
	} else {
		// Waiting: listed but not yet being processed.
		indicator = <Text dimColor>○</Text>;
	}

	return (
		<Box>
			{indicator}
			<Text dimColor={!isProcessing && !isFinished}>{` ${label} `}</Text>
			<SegmentedBar
				skipped={task.skipped}
				stale={task.stale}
				ok={task.ok - task.skipped}
				failed={task.failed}
				of={task.of}
				width={barWidth}
			/>
			{task.failed > 0 ? (
				<Box marginLeft={1}>
					<Badge color="red">{`✗${task.failed}`}</Badge>
				</Box>
			) : null}
			<Text dimColor>{doneAt}</Text>
		</Box>
	);
}
