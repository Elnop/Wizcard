// SCRYFALL ENRICH block: one segmented bar spanning EVERY card in scope (the
// whole DB, or one source when filtered). All segments are DB-snapshot driven
// except green, which is this run's live resolved counter:
//   blue   = resolved before this run (skipped)
//   yellow = outdated, pending re-enrich (--re-enrich only)
//   green  = resolved during this run
//   red    = attempted but unmatched (pre-existing + this run) — oracle_id NULL
//   grey   = still to do (never attempted)
// Plus done/total + % and counters. yellow is a LIVE DB count that shrinks as the
// worker re-attempts outdated cards (they reappear as green/red), so SegmentedBar
// runs with consumeStale=false — green must not also eat yellow (double subtract).

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
	// "done" = no longer pending: blue (pre-resolved) + green (this run) + red
	// (attempted, unmatched). Grey (never attempted) AND yellow (outdated, awaiting
	// re-attempt this run) are both still "to do", so they're excluded.
	const done = state.enrichBlue + state.enrichResolved + state.enrichFailed;
	return (
		<Box flexDirection="column" marginBottom={1} flexShrink={0}>
			<SectionLine title="SCRYFALL ENRICH" width={width} />
			<Box paddingLeft={1}>
				<SegmentedBar
					skipped={state.enrichBlue}
					stale={state.enrichStale}
					ok={state.enrichResolved}
					failed={state.enrichFailed}
					of={state.enrichTotal}
					width={barWidth}
					consumeStale={false}
				/>
			</Box>
			<Box paddingLeft={1}>
				<Text bold>{done.toLocaleString()}</Text>
				<Text dimColor>
					{'/'}
					{state.enrichTotal.toLocaleString()}
					{'  '}
					{pct(done, state.enrichTotal)}
				</Text>
			</Box>
			<Box paddingLeft={1}>
				<Text dimColor>
					{'this run '}
					{state.enrichResolved.toLocaleString()}
					{' resolved · '}
					{state.enrichUnresolved.toLocaleString()}
					{' no match'}
					{state.enrichStale > 0 ? `  outdated ${state.enrichStale.toLocaleString()}` : ''}
					{state.enrichFailed > 0 ? `  unmatched ${state.enrichFailed.toLocaleString()}` : ''}
				</Text>
			</Box>
		</Box>
	);
}
