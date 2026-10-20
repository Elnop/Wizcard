// Pure helpers for seed-catalog.ts (no I/O, no side effects at import), kept apart
// so they can be unit-tested: seed-catalog.ts runs the seed at import time.

import type { CardDefinitionFaceRow, CardDefinitionRow } from './normalize-catalog-card';

/**
 * Groups a batch's print ids by their current face count k, for deleting each
 * print's extra faces (face_index >= k) in a few requests. face_index is 0..k-1, so
 * k is the number of face rows of the print; a print without face rows gets k = 0.
 * Duplicate print ids are collapsed.
 */
export function groupPrintsByFaceCount(
	printIds: readonly string[],
	faceRows: readonly { print_id: string }[]
): Map<number, string[]> {
	const faceCount = new Map<string, number>();
	for (const r of faceRows) faceCount.set(r.print_id, (faceCount.get(r.print_id) ?? 0) + 1);
	const byCount = new Map<number, string[]>();
	for (const id of new Set(printIds)) {
		const k = faceCount.get(id) ?? 0;
		const group = byCount.get(k);
		if (group) group.push(id);
		else byCount.set(k, [id]);
	}
	return byCount;
}

/**
 * Keeps one definition write per oracle per run: the first print wins (the bulk is
 * sorted by print id, so "first" is stable from one run to the next). Prints of one
 * oracle do not always agree on oracle-level data — Scryfall's `oldschool` legality
 * is per print — so writing every print's copy made the definition flip back and
 * forth within a run, and each flip was journaled in catalog_changes as a fake
 * legality change.
 *
 * Returns a function that, given a print's definition + definition faces, returns
 * them the first time their oracle_id is seen and null afterwards.
 */
export function createDefinitionSelector() {
	const seenOracles = new Set<string>();
	return (
		definition: CardDefinitionRow,
		definitionFaces: CardDefinitionFaceRow[]
	): { definition: CardDefinitionRow; definitionFaces: CardDefinitionFaceRow[] } | null => {
		if (seenOracles.has(definition.oracle_id)) return null;
		seenOracles.add(definition.oracle_id);
		return { definition, definitionFaces };
	};
}
