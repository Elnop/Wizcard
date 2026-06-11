// SOURCES pane — full scrollable list of source rows (no more "+N autres…").
// Fills the remaining height of the left column (flexGrow) and shows a
// "first–last / total" position readout so it's obvious when rows are off-screen.
// Presentational: the ScrollView ref is owned by the root so its single useInput
// drives whichever pane is active.

import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { ScrollView, type ScrollViewRef } from 'ink-scroll-view';
import type { HudState } from '../logger';
import { SectionLine } from './Section';
import { TaskRow } from './TaskRow';

interface Props {
	state: HudState;
	width: number;
	active: boolean;
	scrollRef: React.RefObject<ScrollViewRef | null>;
}

export function SourcesScrollPane({ state, width, active, scrollRef }: Props): React.ReactElement {
	const total = state.tasks.length;
	const [offset, setOffset] = useState(0);
	const [viewportH, setViewportH] = useState(0);

	// Rows are 1 line tall, so offset maps directly to the first visible index.
	const first = total === 0 ? 0 : Math.min(offset + 1, total);
	const last = Math.min(offset + viewportH, total);
	const hasMore = viewportH > 0 && viewportH < total;
	const arrow = active ? '↕ ' : '';
	const position = hasMore ? `${arrow}${first}–${last}/${total}` : `${arrow}${total}`;

	return (
		<Box flexDirection="column" flexGrow={1} minHeight={0}>
			<Box width={width} flexShrink={0}>
				<SectionLine
					title="SOURCES"
					width={Math.max(8, width - position.length - 1)}
					active={active}
				/>
				<Text color={active ? 'cyan' : undefined} dimColor={!active}>
					{` ${position}`}
				</Text>
			</Box>
			<Box flexGrow={1} minHeight={0}>
				<ScrollView
					ref={scrollRef}
					onScroll={setOffset}
					onViewportSizeChange={(size) => setViewportH(size.height)}
				>
					{state.tasks.map((t) => (
						<Box key={t.id}>
							<TaskRow task={t} width={width - 1} />
						</Box>
					))}
				</ScrollView>
			</Box>
		</Box>
	);
}
