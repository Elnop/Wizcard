// Root Ink HUD for the ingest pipeline — split-pane layout on stdout.
//   Left pane : header → GLOBAL progress → LISTING (phase 0) or SOURCES (scrollable)
//   Right pane: ÉVÉNEMENTS — scrollable live event log
//
// Owns the single global useInput: routes filter keys (e/w/i/d), pane focus (Tab),
// quit (q) and all navigation keys to the active pane. The two scroll panes are
// presentational — they never touch stdin — so the panes never fight over input.

import React, { useState, useEffect, useCallback } from 'react';
import { Box, useInput, useStdout } from 'ink';
import { ThemeProvider } from '@inkjs/ui';
import type { HudState } from '../logger';
import { wizcardTheme } from './theme';
import { Header } from './Header';
import { Footer } from './Footer';
import { GlobalSection } from './GlobalSection';
import { ScryfallSection } from './ScryfallSection';
import { ListingSection } from './ListingSection';
import { SourcesScrollPane } from './SourcesScrollPane';
import { EventsScrollPane } from './EventsScrollPane';
import { filterEvents, type FilterLevel } from './filter';
import { useFocusPane } from './useFocusPane';
import { useScrollNav } from './useScrollNav';

export interface HudProps {
	getState: () => HudState;
	subscribe: (cb: () => void) => () => void;
}

function isFilterKey(input: string): input is FilterLevel {
	return input === 'e' || input === 'w' || input === 'i' || input === 'd';
}

function HudInner({ getState, subscribe }: HudProps): React.ReactElement {
	const [state, setState] = useState<HudState>(getState);
	const [filter, setFilter] = useState<FilterLevel>('d');
	const { stdout } = useStdout();
	const cols = stdout.columns ?? 80;
	const rows = stdout.rows ?? 24;

	// Coalesce notifications into at most one re-render per frame. The logger
	// fires events at card-rate (the enrich worker alone emits ~2/card over
	// hundreds of thousands of cards); rendering the full Ink tree on every one
	// floods the GC with layout allocations faster than it can reclaim them and
	// the process OOMs. A trailing timer guarantees the final state still paints.
	useEffect(() => {
		let scheduled = false;
		let timer: NodeJS.Timeout | null = null;
		const flush = (): void => {
			scheduled = false;
			timer = null;
			setState(getState());
		};
		const unsubscribe = subscribe(() => {
			if (scheduled) return;
			scheduled = true;
			timer = setTimeout(flush, 66); // ~15fps cap
		});
		return () => {
			if (timer) clearTimeout(timer);
			unsubscribe();
		};
	}, [getState, subscribe]);

	const focus = useFocusPane('events');
	// Show the LISTING DRIVE bar until every source folder is listed; the SOURCES
	// list renders alongside it and fills in on the fly as tasks are registered.
	const showListing =
		state.phase === 'init' ||
		(state.phase === 'listing' && state.listingDone < state.listingTotal) ||
		(state.listingTotal > 0 && state.listingDone < state.listingTotal);
	const filteredEvents = filterEvents(state.recentEvents, filter);

	const sourcesNav = useScrollNav({ itemCount: state.tasks.length, autoTail: false });
	const eventsNav = useScrollNav({ itemCount: filteredEvents.length, autoTail: true });

	useInput(
		useCallback(
			(input: string, key) => {
				if (input === 'q') {
					process.kill(process.pid, 'SIGINT');
					return;
				}
				if (key.tab) {
					focus.toggle();
					return;
				}
				if (isFilterKey(input)) {
					setFilter(input);
					return;
				}
				// Navigation → active pane only.
				if (focus.active === 'sources') sourcesNav.handleKey(input, key);
				else eventsNav.handleKey(input, key);
			},
			[focus, sourcesNav, eventsNav]
		)
	);

	const leftW = Math.max(35, Math.floor(cols * 0.4));
	const rightW = Math.max(20, cols - leftW - 1); // borderLeft consumes 1 col
	const paneRows = Math.max(4, rows - 4); // minus header(2) + footer(2)

	return (
		<Box flexDirection="column" height={rows} overflow="hidden">
			<Header state={state} cols={cols} />
			<Box flexDirection="row" height={paneRows} overflow="hidden">
				<Box flexDirection="column" width={leftW} height={paneRows} overflow="hidden" minHeight={0}>
					<GlobalSection state={state} width={leftW} />
					<ScryfallSection state={state} width={leftW} />
					{showListing ? <ListingSection state={state} width={leftW} /> : null}
					<SourcesScrollPane
						state={state}
						width={leftW}
						active={focus.active === 'sources'}
						scrollRef={sourcesNav.ref}
					/>
				</Box>
				<EventsScrollPane
					events={filteredEvents}
					filter={filter}
					width={rightW}
					active={focus.active === 'events'}
					following={eventsNav.following}
					scrollRef={eventsNav.ref}
				/>
			</Box>
			<Footer filter={filter} activePane={focus.active} cols={cols} />
		</Box>
	);
}

export function Hud(props: HudProps): React.ReactElement {
	return (
		<ThemeProvider theme={wizcardTheme}>
			<HudInner {...props} />
		</ThemeProvider>
	);
}
