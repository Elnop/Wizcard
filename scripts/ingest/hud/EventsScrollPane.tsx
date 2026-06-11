// ÉVÉNEMENTS pane — full scrollable event log via ink-scroll-view.
// Renders every filtered event (the 200-deep buffer), not just the tail, so the
// user can scroll back. Auto-tails the bottom until they scroll up. Fills the
// full pane height (flexGrow); a left divider separates it from the left column,
// tinted cyan when this pane has keyboard focus.

import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { ScrollView, type ScrollViewRef } from 'ink-scroll-view';
import type { HudEvent } from '../logger';
import { SectionLine } from './Section';
import { EventLine } from './EventLine';
import { FILTER_LABELS, type FilterLevel } from './filter';

interface Props {
	events: HudEvent[]; // already filtered
	filter: FilterLevel;
	width: number;
	active: boolean;
	following: boolean;
	scrollRef: React.RefObject<ScrollViewRef | null>;
}

export function EventsScrollPane({
	events,
	filter,
	width,
	active,
	following,
	scrollRef,
}: Props): React.ReactElement {
	const total = events.length;
	const [offset, setOffset] = useState(0);
	const [viewportH, setViewportH] = useState(0);

	const detailMaxLen = Math.max(8, width - 32);
	const status = following ? '↓ auto-scroll' : '⏸ manuel';
	const hasMore = viewportH > 0 && viewportH < total;
	const first = total === 0 ? 0 : Math.min(offset + 1, total);
	const last = Math.min(offset + viewportH, total);
	const posStr = hasMore ? ` ${first}–${last}/${total}` : '';
	const title = `ÉVÉNEMENTS [${FILTER_LABELS[filter]}]${posStr}`;

	return (
		<Box
			flexDirection="column"
			width={width}
			minHeight={0}
			borderStyle="single"
			borderTop={false}
			borderRight={false}
			borderBottom={false}
			borderLeftColor={active ? 'cyan' : 'gray'}
			borderLeftDimColor={!active}
		>
			<Box width={width - 1} flexShrink={0}>
				<SectionLine title={title} width={Math.max(8, width - status.length - 3)} active={active} />
				<Text dimColor> </Text>
				<Text color={following ? 'green' : 'yellow'}>{status}</Text>
			</Box>
			<Box flexGrow={1} minHeight={0}>
				<ScrollView
					ref={scrollRef}
					onScroll={setOffset}
					onViewportSizeChange={(size) => setViewportH(size.height)}
				>
					{events.map((ev, i) => (
						<Box key={`${ev.ts}-${i}`}>
							<EventLine event={ev} detailMaxLen={detailMaxLen} />
						</Box>
					))}
				</ScrollView>
			</Box>
		</Box>
	);
}
