import type { ScryfallSet, ScryfallCardIdentifier } from '@/lib/scryfall/types/scryfall';
import type { ParsedImportRow } from './types';

/** Minimal shape that both ParsedImportResult and DeckImportResult satisfy. */
type Normalizable = {
	rows: ParsedImportRow[];
	identifiers: ScryfallCardIdentifier[];
};

/**
 * Builds a map from alternative set codes (arena_code, mtgo_code) to
 * Scryfall's canonical set code.  Only entries where the alt code differs
 * from the canonical code are included (e.g. arena "dar" → scryfall "dom").
 */
export function buildSetCodeMap(sets: ScryfallSet[]): Map<string, string> {
	const map = new Map<string, string>();
	for (const s of sets) {
		const code = s.code.toLowerCase();
		if (s.arena_code) {
			const arena = s.arena_code.toLowerCase();
			if (arena !== code) map.set(arena, code);
		}
		if (s.mtgo_code) {
			const mtgo = s.mtgo_code.toLowerCase();
			if (mtgo !== code) map.set(mtgo, code);
		}
	}
	return map;
}

function normalizeSetCode(set: string, codeMap: Map<string, string>): string {
	if (!set) return set;
	const lower = set.toLowerCase();
	return codeMap.get(lower) ?? lower;
}

/**
 * Returns a new result with all set codes in rows and identifiers
 * normalized to Scryfall's canonical codes.
 * Generic so it preserves both ParsedImportResult and DeckImportResult.
 */
export function normalizeImportResult<T extends Normalizable>(parsed: T, sets: ScryfallSet[]): T {
	const codeMap = buildSetCodeMap(sets);
	if (codeMap.size === 0) return parsed;

	const rows = parsed.rows.map((row) => {
		const normalized = normalizeSetCode(row.set, codeMap);
		return normalized === row.set ? row : { ...row, set: normalized };
	});

	const identifiers: ScryfallCardIdentifier[] = parsed.identifiers.map((id) => {
		if (!('set' in id) || !id.set) return id;
		const normalized = normalizeSetCode(id.set, codeMap);
		return normalized === id.set ? id : { ...id, set: normalized };
	});

	return { ...parsed, rows, identifiers };
}
