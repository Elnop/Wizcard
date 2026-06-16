// Card line patterns shared by the MTGA collection parser (mtga.ts) and the
// MTGA deck parser (mtga-deck.ts). Inputs are short card-name lines, no ReDoS
// risk — hence the slow-regex suppressions.

// Optional trailing foil/condition marker exported by MTGO/Deckbox/Moxfield,
// e.g. "*F*" (foil) or "*E*" (etched). Stripped before matching set/number.
// eslint-disable-next-line sonarjs/slow-regex -- short card-name lines, no ReDoS risk
const RE_FOIL_SUFFIX = /\s+\*[A-Za-z]+\*$/;

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
	foil: boolean;
} | null;

/** Parse a single MTGA/MTGO card line. Returns null if no pattern matches. */
export function parseMtgaCardLine(line: string): ParsedMtgaCardLine {
	const foil = RE_FOIL_SUFFIX.test(line);
	const body = foil ? line.replace(RE_FOIL_SUFFIX, '') : line;

	let match = RE_FULL.exec(body);
	if (match) {
		return {
			quantity: parseInt(match[1], 10),
			name: match[2],
			set: match[3].toLowerCase(),
			collectorNumber: match[4],
			foil,
		};
	}
	match = RE_SET_ONLY.exec(body);
	if (match) {
		return {
			quantity: parseInt(match[1], 10),
			name: match[2],
			set: match[3].toLowerCase(),
			collectorNumber: '',
			foil,
		};
	}
	match = RE_NAME_ONLY.exec(body);
	if (match) {
		return {
			quantity: parseInt(match[1], 10),
			name: match[2],
			set: '',
			collectorNumber: '',
			foil,
		};
	}
	return null;
}

/** True if the line matches any MTGA card-line shape (used for format detection). */
export function isMtgaCardLine(line: string): boolean {
	const body = line.replace(RE_FOIL_SUFFIX, '');
	return RE_FULL.test(body) || RE_SET_ONLY.test(body) || RE_NAME_ONLY.test(body);
}
