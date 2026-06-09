// Ink HUD for the ingest pipeline — split-pane layout, renders on stdout.
// Left pane: header + global progress + sources list.
// Right pane: live event log stream.
// Both panes adapt exactly to terminal dimensions on every render.
// Toggle event filter: e=error  w=warn+  i=info+  d=all   q=quit

import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import type { HudState, HudEvent, TaskHudState } from './logger';

// ── Helpers ───────────────────────────────────────────────────────────────────

function progressBar(done: number, of: number, width: number): string {
	const ratio = of > 0 ? Math.min(1, done / of) : 0;
	const filled = Math.round(ratio * width);
	return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function pct(done: number, of: number): string {
	return of > 0 ? `${Math.round((done / of) * 100)}%` : ' 0%';
}

function fmtEta(s: number | null): string {
	if (s === null) return 'ETA —';
	const m = Math.floor(s / 60);
	const sec = s % 60;
	return m > 0 ? `ETA ${m}m${String(sec).padStart(2, '0')}` : `ETA ${sec}s`;
}

function fmtElapsed(startedAt: number): string {
	if (startedAt === 0) return '';
	const s = Math.floor((Date.now() - startedAt) / 1000);
	const m = Math.floor(s / 60);
	const sec = s % 60;
	return m > 0 ? `+${m}m${String(sec).padStart(2, '0')}s` : `+${sec}s`;
}

function fmtLabel(label: string, maxLen: number): string {
	const clean = label.startsWith('mpcfill:') ? label.slice(8) : label;
	return clean.length <= maxLen ? clean.padEnd(maxLen) : `${clean.slice(0, maxLen - 1)}…`;
}

function sectionLine(title: string, width: number): string {
	const header = `┤ ${title} ├`;
	return header + '─'.repeat(Math.max(0, width - header.length));
}

// ── Left pane components ──────────────────────────────────────────────────────

function GlobalSection({ state, width }: { state: HudState; width: number }): React.ReactElement {
	const barWidth = Math.max(8, width - 22);
	const bar = progressBar(state.globalDone, state.globalTotal, barWidth);
	const speedStr = state.cardsPerSec !== null ? `${state.cardsPerSec}/s` : '—/s';
	return (
		<Box flexDirection="column" marginBottom={1}>
			<Text dimColor>{sectionLine('GLOBAL', width)}</Text>
			<Box paddingLeft={1}>
				<Text color="green">{bar}</Text>
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
					{speedStr}
					{'  new '}
					{state.newCount}
					{'  skip '}
					{state.skipCount}
				</Text>
				{state.warningTotal > 0 ? <Text color="yellow">{`  ⚠${state.warningTotal}`}</Text> : null}
				{state.errorTotal > 0 ? <Text color="red">{`  ✗${state.errorTotal}`}</Text> : null}
			</Box>
		</Box>
	);
}

function TaskRow({ task, width }: { task: TaskHudState; width: number }): React.ReactElement {
	const barWidth = Math.max(4, width - 32);
	const bar = progressBar(task.done, task.of, barWidth);
	const isFinished = task.finishedAt !== undefined;
	const icon = isFinished ? '✓' : '⟳';
	let iconColor: string;
	if (isFinished) {
		iconColor = task.failed > 0 ? 'yellow' : 'green';
	} else {
		iconColor = task.failed > 0 ? 'yellow' : 'blue';
	}
	const labelLen = Math.max(8, width - barWidth - 16);
	const label = fmtLabel(task.label, labelLen);
	const failStr = task.failed > 0 ? ` ✗${task.failed}` : '';
	const doneAt = isFinished
		? ` ${new Date(task.finishedAt!).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
		: ` ${pct(task.done, task.of).padStart(4)}`;
	return (
		<Box>
			<Text color={iconColor}>{icon} </Text>
			<Text>{label} </Text>
			<Text color={task.failed > 0 ? 'yellow' : 'green'}>{bar}</Text>
			<Text color="red">{failStr}</Text>
			<Text dimColor>{doneAt}</Text>
		</Box>
	);
}

function SourcesSection({
	state,
	width,
	maxRows,
}: {
	state: HudState;
	width: number;
	maxRows: number;
}): React.ReactElement {
	const maxTasks = Math.max(1, maxRows - 1);
	const shown = state.tasks.slice(0, maxTasks);
	const overflow = state.tasks.length - shown.length;
	return (
		<Box flexDirection="column">
			<Text dimColor>{sectionLine('SOURCES', width)}</Text>
			<Box flexDirection="column" overflowY="hidden" height={maxTasks}>
				{shown.map((t) => (
					<TaskRow key={t.id} task={t} width={width - 1} />
				))}
			</Box>
			{overflow > 0 && <Text dimColor>{`  +${overflow} autres…`}</Text>}
		</Box>
	);
}

function ListingSection({ state, width }: { state: HudState; width: number }): React.ReactElement {
	const barWidth = Math.max(8, width - 22);
	const bar = progressBar(state.listingDone, state.listingTotal, barWidth);
	const pctStr = pct(state.listingDone, state.listingTotal);
	return (
		<Box flexDirection="column">
			<Text dimColor>{sectionLine('LISTING DRIVE', width)}</Text>
			<Box paddingLeft={1}>
				<Text color="cyan">{bar}</Text>
			</Box>
			<Box paddingLeft={1}>
				<Text bold>{state.listingDone}</Text>
				<Text dimColor>
					{'/'}
					{state.listingTotal}
					{'  '}
					{pctStr}
					{'  sources listées'}
				</Text>
			</Box>
		</Box>
	);
}

function LeftPane({
	state,
	width,
	rows,
}: {
	state: HudState;
	width: number;
	rows: number;
}): React.ReactElement {
	const isListing = state.phase === 'listing' || state.phase === 'init';
	// rows budget: total - global(4+header) - section header - footer
	const sourcesMaxRows = Math.max(1, rows - 9);
	return (
		<Box flexDirection="column" width={width}>
			<GlobalSection state={state} width={width} />
			{isListing ? (
				<ListingSection state={state} width={width} />
			) : (
				<SourcesSection state={state} width={width} maxRows={sourcesMaxRows} />
			)}
		</Box>
	);
}

// ── Right pane components ─────────────────────────────────────────────────────

type FilterLevel = 'e' | 'w' | 'i' | 'd';

const FILTER_LABELS: Record<FilterLevel, string> = {
	e: 'e=error',
	w: 'w=warn+',
	i: 'i=info+',
	d: 'd=all',
};

function filterEvents(events: HudEvent[], filter: FilterLevel): HudEvent[] {
	if (filter === 'e') return events.filter((ev) => ev.level === 'error');
	if (filter === 'w') return events.filter((ev) => ev.level === 'warn' || ev.level === 'error');
	return events;
}

function RightPane({
	events,
	filter,
	width,
	rows,
}: {
	events: HudEvent[];
	filter: FilterLevel;
	width: number;
	rows: number;
}): React.ReactElement {
	const maxEvents = Math.max(1, rows - 2); // rows - header - footer
	const filtered = filterEvents(events, filter);
	const shown = filtered.slice(-maxEvents);
	const detailMaxLen = Math.max(8, width - 32);

	return (
		<Box flexDirection="column" width={width} borderLeft borderStyle="single" borderLeftDimColor>
			<Text dimColor>{sectionLine(`ÉVÉNEMENTS [${FILTER_LABELS[filter]}]`, width - 1)}</Text>
			<Box flexDirection="column" overflowY="hidden" height={maxEvents}>
				{shown.map((ev, i) => {
					let icon: string;
					let iconColor: string;
					let detailColor: string | undefined;
					if (ev.level === 'error') {
						icon = '✗';
						iconColor = 'red';
						detailColor = 'red';
					} else if (ev.level === 'warn') {
						icon = '⚠';
						iconColor = 'yellow';
						detailColor = 'yellow';
					} else {
						icon = '✓';
						iconColor = 'green';
						detailColor = undefined;
					}
					const src = ev.source ? ev.source.replace('mpcfill:', '') : ev.name;
					const srcLabel = src.slice(0, 12).padEnd(12);
					const detail = ev.detail.slice(0, detailMaxLen);
					return (
						<Box key={i}>
							<Text dimColor>
								{ev.ts}
								{'  '}
							</Text>
							<Text color={iconColor}>
								{icon}
								{'  '}
							</Text>
							<Text dimColor>
								{srcLabel}
								{'  '}
							</Text>
							<Text color={detailColor}>{detail}</Text>
						</Box>
					);
				})}
			</Box>
		</Box>
	);
}

// ── Header + Footer ───────────────────────────────────────────────────────────

function Header({ state, cols }: { state: HudState; cols: number }): React.ReactElement {
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
				{'◆ Wizcard Ingest'}
			</Text>
			<Text dimColor>
				{'  ·  '}
				{parts}
				{elapsed}
			</Text>
		</Box>
	);
}

function Footer({ filter, cols }: { filter: FilterLevel; cols: number }): React.ReactElement {
	const keys: FilterLevel[] = ['e', 'w', 'i', 'd'];
	return (
		<Box width={cols} marginTop={1}>
			<Text dimColor>{'  '}</Text>
			{keys.map((k) => (
				<Text key={k} color={k === filter ? 'cyan' : undefined} dimColor={k !== filter}>
					{`[${FILTER_LABELS[k]}]  `}
				</Text>
			))}
			<Text dimColor>{'[q] quit'}</Text>
		</Box>
	);
}

// ── Main HUD component ────────────────────────────────────────────────────────

export interface HudProps {
	getState: () => HudState;
	subscribe: (cb: () => void) => () => void;
}

export function Hud({ getState, subscribe }: HudProps): React.ReactElement {
	const [state, setState] = useState<HudState>(getState);
	const [filter, setFilter] = useState<FilterLevel>('d');
	const { stdout } = useStdout();
	const cols = stdout.columns ?? 80;
	const rows = stdout.rows ?? 24;

	useEffect(() => {
		const unsub = subscribe(() => setState(getState()));
		return unsub;
	}, [getState, subscribe]);

	useInput(
		useCallback((input: string) => {
			if (input === 'e' || input === 'w' || input === 'i' || input === 'd')
				setFilter(input as FilterLevel);
			if (input === 'q') process.kill(process.pid, 'SIGINT');
		}, [])
	);

	const leftW = Math.max(35, Math.floor(cols * 0.4));
	// borderLeft on RightPane consumes 1 col
	const rightW = Math.max(20, cols - leftW - 1);
	// rows available for panes: total - header(2) - footer(2)
	const paneRows = Math.max(4, rows - 4);

	return (
		<Box flexDirection="column">
			<Header state={state} cols={cols} />
			<Box flexDirection="row">
				<LeftPane state={state} width={leftW} rows={paneRows} />
				<RightPane events={state.recentEvents} filter={filter} width={rightW} rows={paneRows} />
			</Box>
			<Footer filter={filter} cols={cols} />
		</Box>
	);
}
