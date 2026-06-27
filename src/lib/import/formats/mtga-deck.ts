import type { ScryfallCardIdentifier } from '@/lib/scryfall/types/scryfall';
import type { DeckFormat, DeckZone } from '@/types/decks';
import { parseMtgaCardLine } from './mtgaCardLine';

// Minimal deck card row (separate from collection PendingCard)
interface ParsedImportRow {
	name: string;
	set: string;
	collectorNumber: string;
	quantity: number;
}

// Zone section headers — map to deck zone
const SECTION_HEADERS: Record<string, DeckZone> = {
	deck: 'mainboard',
	mainboard: 'mainboard',
	main: 'mainboard',
	'main deck': 'mainboard',
	sideboard: 'sideboard',
	side: 'sideboard',
	commander: 'commander',
	companion: 'commander',
	maybeboard: 'maybeboard',
	maybe: 'maybeboard',
	considering: 'maybeboard',
};

// Type-based headers (Moxfield text, Archidekt) — skip without changing zone
const TYPE_HEADERS = new Set([
	'creatures',
	'creature',
	'instants',
	'instant',
	'sorceries',
	'sorcery',
	'enchantments',
	'enchantment',
	'artifacts',
	'artifact',
	'planeswalkers',
	'planeswalker',
	'battles',
	'battle',
	'lands',
	'land',
	'spells',
	'noncreature',
	'nonland',
	'other',
	'interaction',
	'ramp',
	'removal',
	'draw',
	'card draw',
	'protection',
	'utility',
	'mana',
	'mana base',
]);

// Deck name patterns — short inputs, no ReDoS risk
/* eslint-disable sonarjs/slow-regex */
const RE_MTGA_NAME = /^Name\s+(.+)$/i;
const RE_COMMENT_NAME = /^\/\/\s*(.+)$/;
const RE_HASH_NAME = /^#\s+(.+)$/;
const RE_NAME_COLON = /^Name:\s*(.+)$/i;

// Lines that are metadata / comments to skip
const RE_COMMENT_LINE = /^(\/\/|#)/;
const RE_CARD_COUNT_COMMENT = /^(\/\/|#)\s*\d+\s+(cards?|cartes?|sideboard|mainboard)/i;
/* eslint-enable sonarjs/slow-regex */

export type DeckImportRow = ParsedImportRow & { zone: DeckZone };

export interface DeckImportResult {
	rows: DeckImportRow[];
	parseErrors: string[];
	identifiers: ScryfallCardIdentifier[];
	deckName: string | null;
	detectedFormat: DeckFormat | null;
}

/* eslint-disable sonarjs/slow-regex -- all inputs are short single-line strings, no ReDoS risk */
/**
 * Normalize a raw line to a standard format before regex matching.
 * Handles: Nx notation, markdown links, URLs, Archidekt brackets.
 */
function normalizeLine(raw: string): string {
	let line = raw.trim();
	if (!line) return '';

	// Strip markdown links: [name](url) → name
	line = line.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

	// Strip inline URLs: (https://...)
	line = line.replace(/\(https?:\/\/[^)]*\)/g, '');

	// Convert Archidekt set notation: [[SET:NUM]] → (SET) NUM
	line = line.replace(/\[\[([A-Za-z0-9]+):(\d+[a-z]?)\]\]/g, '($1) $2');

	// Strip remaining square brackets around card names: [Name] → Name
	line = line.replace(/\[([^\]]+)\]/g, '$1');

	// Normalize "4x " or "4X " → "4 "
	line = line.replace(/^(\d+)[xX]\s+/, '$1 ');

	return line.trim();
}
/* eslint-enable sonarjs/slow-regex */

function detectMtgaOfficialName(lines: string[]): string | null {
	for (let i = 0; i < Math.min(lines.length - 1, 5); i++) {
		if (lines[i].trim().toLowerCase() === 'about') {
			const nameMatch = RE_MTGA_NAME.exec(lines[i + 1]?.trim() ?? '');
			if (nameMatch) return nameMatch[1].trim();
		}
	}
	return null;
}

function detectFallbackName(lines: string[]): string | null {
	for (let i = 0; i < Math.min(lines.length, 3); i++) {
		const line = lines[i].trim();
		if (!line) continue;
		const nameColonMatch = RE_NAME_COLON.exec(line);
		if (nameColonMatch) return nameColonMatch[1].trim();
		if (i === 0) {
			const commentMatch = RE_COMMENT_NAME.exec(line);
			if (commentMatch && !RE_CARD_COUNT_COMMENT.test(line)) return commentMatch[1].trim();
			const hashMatch = RE_HASH_NAME.exec(line);
			if (hashMatch && !RE_CARD_COUNT_COMMENT.test(line)) return hashMatch[1].trim();
		}
		break;
	}
	return null;
}

function detectDeckName(lines: string[]): string | null {
	return detectMtgaOfficialName(lines) ?? detectFallbackName(lines);
}

function detectFormat(rows: DeckImportRow[]): DeckFormat | null {
	let mainboardCount = 0;
	let sideboardCount = 0;
	let commanderCount = 0;

	for (const row of rows) {
		switch (row.zone) {
			case 'mainboard':
				mainboardCount += row.quantity;
				break;
			case 'sideboard':
				sideboardCount += row.quantity;
				break;
			case 'commander':
				commanderCount += row.quantity;
				break;
		}
	}

	if (commanderCount > 0) {
		if (mainboardCount >= 55 && mainboardCount <= 63) return 'brawl';
		return 'commander';
	}

	if (mainboardCount >= 38 && mainboardCount <= 45 && sideboardCount === 0) {
		return 'draft';
	}

	return null;
}

/**
 * Check if a line (after trimming/lowercasing) is a section header.
 * Supports plain ("Sideboard"), trailing-colon ("Sideboard:") and decorated
 * ("== Considering ==") variants — the latter is emitted by some exporters.
 */
function matchSectionHeader(line: string): DeckZone | undefined {
	let key = line.toLowerCase();
	// Strip surrounding "=" decorations: "== considering ==" → "considering"
	// eslint-disable-next-line sonarjs/slow-regex -- short header strings, no ReDoS risk
	key = key.replace(/^=+\s*/, '').replace(/\s*=+$/, '');
	// Strip trailing colon: "Sideboard:" → "sideboard"
	if (key.endsWith(':')) key = key.slice(0, -1).trimEnd();

	return SECTION_HEADERS[key.trim()];
}

/**
 * Check if a line is a type-based header (Creatures, Lands, etc.)
 * These are skipped without changing the current zone.
 */
function isTypeHeader(line: string): boolean {
	let key = line.toLowerCase();
	if (key.endsWith(':')) key = key.slice(0, -1).trimEnd();
	// Also match headers with card counts: "Creatures (12)"
	// eslint-disable-next-line sonarjs/slow-regex -- short header strings, no ReDoS risk
	key = key.replace(/\s*\(\d+\)\s*$/, '');
	return TYPE_HEADERS.has(key);
}

// eslint-disable-next-line sonarjs/cognitive-complexity -- line-by-line MTGA deck parser with zone tracking, inherent complexity
export function parseMTGADeck(text: string): DeckImportResult {
	const lines = text.split(/\r?\n/);
	const rows: DeckImportRow[] = [];
	const parseErrors: string[] = [];
	const identifiers: ScryfallCardIdentifier[] = [];

	const deckName = detectDeckName(lines);

	// Pre-scan: check if any zone section headers exist in the text
	const hasHeaders = lines.some((l) => matchSectionHeader(l.trim()) !== undefined);

	let currentZone: DeckZone = 'mainboard';
	let hasSeenCards = false;

	for (let i = 0; i < lines.length; i++) {
		const raw = lines[i].trim();

		if (!raw) {
			// Blank line heuristic: if no headers and we've seen cards, switch to sideboard
			if (!hasHeaders && hasSeenCards) {
				currentZone = 'sideboard';
			}
			continue;
		}

		// Check zone section headers
		const headerZone = matchSectionHeader(raw);
		if (headerZone !== undefined) {
			currentZone = headerZone;
			continue;
		}

		// Skip type-based headers (Creatures, Lands, etc.)
		if (isTypeHeader(raw)) continue;

		// Skip metadata lines
		if (raw.toLowerCase() === 'about') continue;
		if (RE_MTGA_NAME.test(raw)) continue;
		if (RE_NAME_COLON.test(raw)) continue;

		// Skip comment/metadata lines
		if (RE_COMMENT_LINE.test(raw)) {
			// First non-empty line comment is handled by name detection — skip it
			if (!hasSeenCards) continue;
			// Later comments are just ignored
			continue;
		}

		// Normalize the line for card matching
		const line = normalizeLine(raw);
		if (!line) continue;

		const parsed = parseMtgaCardLine(line);
		if (parsed) {
			const { name, set, collectorNumber, quantity } = parsed;
			rows.push({ name, set, collectorNumber, quantity, zone: currentZone });
			if (collectorNumber && set) identifiers.push({ set, collector_number: collectorNumber });
			else if (set) identifiers.push({ name, set });
			else identifiers.push({ name });
			hasSeenCards = true;
			continue;
		}

		parseErrors.push(`Line ${i + 1}: unrecognized format "${raw}"`);
	}

	const detectedFormat = detectFormat(rows);

	return { rows, parseErrors, identifiers, deckName, detectedFormat };
}
