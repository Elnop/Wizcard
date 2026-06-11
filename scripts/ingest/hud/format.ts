// Pure formatting helpers for the ingest HUD. No React, no side effects —
// everything here is a string transform so it can be unit-tested in isolation.

export function pct(done: number, of: number): string {
	return of > 0 ? `${Math.round((done / of) * 100)}%` : ' 0%';
}

export function fmtEta(s: number | null): string {
	if (s === null) return 'ETA —';
	const m = Math.floor(s / 60);
	const sec = s % 60;
	return m > 0 ? `ETA ${m}m${String(sec).padStart(2, '0')}` : `ETA ${sec}s`;
}

export function fmtElapsed(startedAt: number): string {
	if (startedAt === 0) return '';
	const s = Math.floor((Date.now() - startedAt) / 1000);
	const m = Math.floor(s / 60);
	const sec = s % 60;
	return m > 0 ? `+${m}m${String(sec).padStart(2, '0')}s` : `+${sec}s`;
}

// Strip the "mpcfill:" prefix and pad/truncate to a fixed display width.
export function fmtLabel(label: string, maxLen: number): string {
	const clean = label.startsWith('mpcfill:') ? label.slice(8) : label;
	return clean.length <= maxLen ? clean.padEnd(maxLen) : `${clean.slice(0, maxLen - 1)}…`;
}

// "HH:MM" finished-at timestamp (fr-FR), used on completed task rows.
export function fmtClock(ts: number): string {
	return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
