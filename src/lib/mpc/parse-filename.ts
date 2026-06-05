export interface ParsedCardFilename {
	cardName: string;
	variants: string[];
	bracketTags: string[];
	setCode: string | null;
	collectorNumber: string | null;
	extension: string | null;
	language: string | null;
}

const EXT_RE = /\.([a-zA-Z0-9]+)$/u;
// eslint-disable-next-line sonarjs/slow-regex
const BRACKET_RE = /\[([^\]]*)\]/gu;
// eslint-disable-next-line sonarjs/slow-regex
const PAREN_RE = /\(([^)]*)\)/gu;
// Numeric collector number: {357}
const COLLECTOR_RE = /\{(\d+)\}/u;
// Valid Scryfall set code: 2-6 alphanumeric chars, no spaces or commas
const SET_CODE_RE = /^[A-Za-z0-9]{2,6}$/u;
// Language prefix like {DE} or {EN}: 1-3 alphabetic chars only at start of filename (ISO-639-1)
const LANG_PREFIX_RE = /^\{([A-Za-z]{1,3})\}\s*/u;
// Comma separator for splitting bracket/paren tag lists
// eslint-disable-next-line sonarjs/slow-regex
const TAG_SPLIT_RE = /\s*,\s*/u;
// Numeric sort prefix: "19 - ", "03. ", "26.", "037_", or bare digits+space "9 ", "12 "
// eslint-disable-next-line sonarjs/slow-regex
const NUMERIC_PREFIX_RE = /^\d+\s*(?:[-–—._]\s*|\s+(?=[A-Za-z]))/u;

// Apostrophe-encoded underscores: "tormod_s" → "tormod's"
const APOSTROPHE_RE = /_s(?=\s|$)/gu;
function restoreApostrophes(s: string): string {
	return s.replace(APOSTROPHE_RE, "'s");
}

function restoreUnderscoreSpaces(s: string): string {
	return s.replace(/_/gu, ' ');
}

// eslint-disable-next-line sonarjs/slow-regex
const BRACE_RE = /\{[^}]*\}/gu;

function normalizeCardName(name: string): string {
	let n = name;
	n = restoreApostrophes(n);
	n = restoreUnderscoreSpaces(n);
	n = n.replace(/\s{2,}/gu, ' ');
	return n.trim();
}

function extractCardName(s: string): string {
	let n = s;
	n = n.replace(BRACKET_RE, '');
	n = n.replace(PAREN_RE, '');
	n = n.replace(BRACE_RE, '');
	n = n.replace(NUMERIC_PREFIX_RE, '');
	n = n.replace(/\s{2,}/gu, ' ');
	return normalizeCardName(n);
}

function extractBracketTags(s: string): { bracketTags: string[]; setCode: string | null } {
	const bracketTags: string[] = [];
	let setCode: string | null = null;
	BRACKET_RE.lastIndex = 0;
	for (const m of s.matchAll(BRACKET_RE)) {
		const parts = m[1].trim().split(TAG_SPLIT_RE).filter(Boolean);
		const isSingleToken = parts.length === 1;
		for (const tag of parts) {
			bracketTags.push(tag);
			if (setCode === null && isSingleToken && SET_CODE_RE.test(tag)) {
				setCode = tag.toUpperCase();
			}
		}
	}
	return { bracketTags, setCode };
}

const DRIVE_ID_PAREN_RE = /^[A-Za-z0-9_-]{25,}$/u;
const PURE_DIGITS_RE = /^\d+$/u;

function extractVariants(s: string): string[] {
	const variants: string[] = [];
	PAREN_RE.lastIndex = 0;
	for (const m of s.matchAll(PAREN_RE)) {
		const inner = m[1].trim();
		if (!inner || DRIVE_ID_PAREN_RE.test(inner)) continue;
		for (const part of inner.split(TAG_SPLIT_RE).filter(Boolean)) {
			if (!PURE_DIGITS_RE.test(part)) variants.push(part);
		}
	}
	return variants;
}

export function parseCardFilename(filename: string): ParsedCardFilename {
	const extMatch = EXT_RE.exec(filename);
	const extension = extMatch ? extMatch[1].toLowerCase() : null;
	const withoutExt = extMatch ? filename.slice(0, extMatch.index) : filename;

	const langMatch = LANG_PREFIX_RE.exec(withoutExt);
	const language = langMatch ? langMatch[1].toUpperCase() : null;
	const afterLang = langMatch ? withoutExt.slice(langMatch[0].length) : withoutExt;

	const collectorMatch = COLLECTOR_RE.exec(afterLang);
	const collectorNumber = collectorMatch ? collectorMatch[1] : null;

	const { bracketTags, setCode } = extractBracketTags(afterLang);
	const variants = extractVariants(afterLang);
	const cardName = extractCardName(afterLang);

	return { cardName, variants, bracketTags, setCode, collectorNumber, extension, language };
}
