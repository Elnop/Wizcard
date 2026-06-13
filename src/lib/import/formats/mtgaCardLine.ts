// Card line patterns shared by the MTGA collection parser (mtga.ts) and the
// MTGA deck parser (mtga-deck.ts). Inputs are short card-name lines, no ReDoS
// risk — hence the slow-regex suppressions.

// eslint-disable-next-line sonarjs/slow-regex -- short card-name lines, no ReDoS risk
const RE_FULL = /^(\d+)\s+(.+?)\s+\(([A-Za-z0-9]+)\)\s+(\d+[a-z]?)$/;
// eslint-disable-next-line sonarjs/slow-regex -- short card-name lines, no ReDoS risk
const RE_SET_ONLY = /^(\d+)\s+(.+?)\s+\(([A-Za-z0-9]+)\)$/;
// eslint-disable-next-line sonarjs/slow-regex -- short card-name lines, no ReDoS risk
const RE_NAME_ONLY = /^(\d+)\s+(.+)$/;

export type ParsedMtgaCardLine = {
	name: string;
	set: string;
	collectorNumber: string;
	quantity: number;
} | null;

/** Parse a single MTGA/MTGO card line. Returns null if no pattern matches. */
export function parseMtgaCardLine(line: string): ParsedMtgaCardLine {
	let match = RE_FULL.exec(line);
	if (match) {
		return {
			quantity: parseInt(match[1], 10),
			name: match[2],
			set: match[3].toLowerCase(),
			collectorNumber: match[4],
		};
	}
	match = RE_SET_ONLY.exec(line);
	if (match) {
		return {
			quantity: parseInt(match[1], 10),
			name: match[2],
			set: match[3].toLowerCase(),
			collectorNumber: '',
		};
	}
	match = RE_NAME_ONLY.exec(line);
	if (match) {
		return { quantity: parseInt(match[1], 10), name: match[2], set: '', collectorNumber: '' };
	}
	return null;
}

/** True if the line matches any MTGA card-line shape (used for format detection). */
export function isMtgaCardLine(line: string): boolean {
	return RE_FULL.test(line) || RE_SET_ONLY.test(line) || RE_NAME_ONLY.test(line);
}
