// Multi-colour progress bar — the one bar @inkjs/ui can't express (its
// ProgressBar is single-colour). Renders four stacked segments left→right:
//   blue=skipped  yellow=stale  green=ok  red=failed  + dim track for remaining.
//
// The segment-sizing maths is intentionally kept verbatim from the original HUD:
// it clamps inputs so segments never overflow the total (DB counts can exceed
// Drive counts) and distributes rounding error to the largest segment so the bar
// is always exactly `width` chars wide.

import React from 'react';
import { Text } from 'ink';

interface BarSegment {
	text: string;
	color: string | undefined;
	dimColor?: boolean;
}

function computeSegments(
	skipped: number,
	stale: number,
	ok: number,
	failed: number,
	of: number,
	width: number,
	consumeStale: boolean
): BarSegment[] {
	if (of <= 0) return [{ text: '░'.repeat(width), color: undefined, dimColor: true }];

	// Clamp inputs so segments never overflow the total (e.g. DB count > Drive count).
	const safeSkipped = Math.min(skipped, of);
	const safeStale = Math.min(stale, of - safeSkipped);
	const safeOk = Math.min(ok, of - safeSkipped - safeStale);
	const safeFailed = Math.min(failed, of - safeSkipped - safeStale - safeOk);

	// consumeStale=true (default): ok ticks eat the stale band first, then new — for
	// bars where `stale` is a fixed at-launch count and green grows on top of it.
	// consumeStale=false: `stale` is already a LIVE count that shrinks on its own as
	// cards are re-attempted (the SCRYFALL bar), so green must NOT also eat it — that
	// would subtract the same cards twice. There, green sits entirely in the new band.
	const okInStale = consumeStale ? Math.min(safeOk, safeStale) : 0;
	const okInNew = Math.max(0, safeOk - okInStale);
	const staleRemaining = safeStale - okInStale;
	const newRemaining = Math.max(0, of - safeSkipped - safeStale - okInNew - safeFailed);

	const toW = (n: number): number => Math.round((n / of) * width);

	let wSkipped = toW(safeSkipped);
	let wStale = toW(staleRemaining);
	let wOk = toW(safeOk);
	let wFailed = toW(safeFailed);
	let wNew = toW(newRemaining);

	// Clamp total to exactly width, distributing the rounding error to the largest segment.
	const total = wSkipped + wStale + wOk + wFailed + wNew;
	const diff = width - total;
	const largest = [
		[wSkipped, 0],
		[wStale, 1],
		[wOk, 2],
		[wFailed, 3],
		[wNew, 4],
	].sort((a, b) => b[0] - a[0]);
	const ws = [wSkipped, wStale, wOk, wFailed, wNew];
	ws[largest[0][1]] = Math.max(0, ws[largest[0][1]] + diff);
	[wSkipped, wStale, wOk, wFailed, wNew] = ws;

	const segments: BarSegment[] = [];
	if (wSkipped > 0) segments.push({ text: '█'.repeat(wSkipped), color: 'blue' });
	if (wStale > 0) segments.push({ text: '█'.repeat(wStale), color: 'yellow' });
	if (wOk > 0) segments.push({ text: '█'.repeat(wOk), color: 'green' });
	if (wFailed > 0) segments.push({ text: '█'.repeat(wFailed), color: 'red' });
	if (wNew > 0) segments.push({ text: '░'.repeat(wNew), color: undefined, dimColor: true });
	return segments;
}

interface SegmentedBarProps {
	skipped: number;
	stale: number;
	ok: number;
	failed: number;
	of: number;
	width: number;
	// Whether green (ok) consumes the stale band. Default true (per-source / global
	// bars where stale is fixed at launch). The SCRYFALL bar sets false: its stale
	// is a live DB count that already shrinks as cards are re-attempted.
	consumeStale?: boolean;
}

export function SegmentedBar({
	skipped,
	stale,
	ok,
	failed,
	of,
	width,
	consumeStale = true,
}: SegmentedBarProps): React.ReactElement {
	const segments = computeSegments(skipped, stale, ok, failed, of, width, consumeStale);
	return (
		<>
			{segments.map((seg, i) => (
				<Text key={i} color={seg.color} dimColor={seg.dimColor}>
					{seg.text}
				</Text>
			))}
		</>
	);
}
