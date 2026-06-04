export interface ParsedCardFilename {
	cardName: string;
	variants: string[];
	bracketTags: string[];
	collectorNumber: string | null;
	extension: string | null;
}

const EXT_RE = /\.([a-zA-Z0-9]+)$/u;
// eslint-disable-next-line sonarjs/slow-regex
const VARIANT_RE = /\(([^)]*)\)/gu;
// eslint-disable-next-line sonarjs/slow-regex
const BRACKET_RE = /\[([^\]]*)\]/gu;
const COLLECTOR_RE = /\{(\d+)\}/u;
const METADATA_START_RE = /[([{]/u;

export function parseCardFilename(filename: string): ParsedCardFilename {
	let rest = filename;

	const extMatch = EXT_RE.exec(rest);
	const extension = extMatch ? extMatch[1].toLowerCase() : null;
	if (extMatch) rest = rest.slice(0, extMatch.index);

	const metaStart = METADATA_START_RE.exec(rest);
	const cardName = (metaStart ? rest.slice(0, metaStart.index) : rest).trim();

	const variants: string[] = [];
	for (const m of rest.matchAll(VARIANT_RE)) variants.push(m[1].trim());

	const bracketTags: string[] = [];
	for (const m of rest.matchAll(BRACKET_RE)) bracketTags.push(m[1].trim());

	const collectorMatch = COLLECTOR_RE.exec(rest);
	const collectorNumber = collectorMatch ? collectorMatch[1] : null;

	return { cardName, variants, bracketTags, collectorNumber, extension };
}
