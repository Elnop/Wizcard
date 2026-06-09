// Reusable Ink primitives for the ingest HUD.

import React from 'react';
import { Box, Text, useStdout } from 'ink';

// ── Section ───────────────────────────────────────────────────────────────────
// Renders:  ┤ TITLE ├────────────────
// then children below with left padding.

interface SectionProps {
	title: string;
	children?: React.ReactNode;
}

export function Section({ title, children }: SectionProps): React.ReactElement {
	const { stdout } = useStdout();
	const cols = stdout.columns ?? 80;
	const header = `┤ ${title} ├`;
	const line = header + '─'.repeat(Math.max(0, cols - header.length - 2));
	return (
		<Box flexDirection="column" marginBottom={0}>
			<Text dimColor>{line}</Text>
			{children && (
				<Box flexDirection="column" paddingLeft={2}>
					{children}
				</Box>
			)}
		</Box>
	);
}

// ── ProgressBar ───────────────────────────────────────────────────────────────
// Returns a string of filled/empty block chars representing done/of.

export function progressBar(done: number, of: number, width: number): string {
	const ratio = of > 0 ? Math.min(1, done / of) : 0;
	const filled = Math.round(ratio * width);
	return '█'.repeat(filled) + '░'.repeat(width - filled);
}

// ── pct ───────────────────────────────────────────────────────────────────────
export function pct(done: number, of: number): string {
	return of > 0 ? `${Math.round((done / of) * 100)}%` : '0%';
}

// ── fmtEta ────────────────────────────────────────────────────────────────────
export function fmtEta(s: number | null): string {
	if (s === null) return 'ETA —';
	const m = Math.floor(s / 60);
	const sec = s % 60;
	return m > 0 ? `ETA ${m}m${String(sec).padStart(2, '0')}` : `ETA ${sec}s`;
}

// ── fmtElapsed ────────────────────────────────────────────────────────────────
export function fmtElapsed(startedAt: number): string {
	const s = Math.floor((Date.now() - startedAt) / 1000);
	const m = Math.floor(s / 60);
	const sec = s % 60;
	return m > 0 ? `+${m}m${String(sec).padStart(2, '0')}s` : `+${sec}s`;
}

// ── fmtLabel ──────────────────────────────────────────────────────────────────
// Truncates label to maxLen, stripping "mpcfill:" prefix for display.
export function fmtLabel(label: string, maxLen: number): string {
	const clean = label.startsWith('mpcfill:') ? label.slice(8) : label;
	return clean.length <= maxLen ? clean.padEnd(maxLen) : clean.slice(0, maxLen - 1) + '…';
}
