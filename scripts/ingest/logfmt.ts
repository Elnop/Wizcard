// Pure logfmt serialization. Turns a flat field object into a `key=value …`
// string. Values without spaces/equals/quotes render bare; otherwise they are
// double-quoted with inner quotes escaped. null/undefined fields are dropped.
// No I/O — this is the machine-format primitive used by logger.ts.

export type LogfmtValue = string | number | boolean | null | undefined;
export type LogfmtFields = Record<string, LogfmtValue>;

function needsQuoting(s: string): boolean {
	return s === '' || /[\s="]/u.test(s);
}

function formatValue(v: string | number | boolean): string {
	if (typeof v === 'number' || typeof v === 'boolean') return String(v);
	if (!needsQuoting(v)) return v;
	const escaped = v.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"');
	return `"${escaped}"`;
}

export function toLogfmt(fields: LogfmtFields): string {
	const parts: string[] = [];
	for (const [key, value] of Object.entries(fields)) {
		if (value === null || value === undefined) continue;
		parts.push(`${key}=${formatValue(value)}`);
	}
	return parts.join(' ');
}
