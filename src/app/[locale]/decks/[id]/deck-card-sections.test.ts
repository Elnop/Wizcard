import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CardEntry } from '@/types/cards';
import type { DeckZone } from '@/types/decks';
import type { ResolvedDeckCard } from './useDeckDetail';
import { buildDeckCardSections } from './useDeckCardSections';

let n = 0;
function copy(
	zone: DeckZone,
	over: { id?: string; oracle_id?: string; name?: string } = {},
	entry: Partial<CardEntry> = {}
): ResolvedDeckCard {
	n += 1;
	return {
		id: over.id ?? 'print-a',
		oracle_id: over.oracle_id ?? 'oracle-sol-ring',
		name: over.name ?? 'Sol Ring',
		lang: 'en',
		set: 'c21',
		collector_number: '263',
		type_line: 'Artifact',
		entry: { rowId: `row-${n}`, dateAdded: '2026-01-01T00:00:00Z', tags: [zone], ...entry },
	} as unknown as ResolvedDeckCard;
}

function byZone(cards: ResolvedDeckCard[]): Record<DeckZone, ResolvedDeckCard[]> {
	const out: Record<DeckZone, ResolvedDeckCard[]> = {
		commander: [],
		mainboard: [],
		sideboard: [],
		maybeboard: [],
		tokens: [],
	};
	for (const c of cards) out[(c.entry.tags?.[0] as DeckZone) ?? 'mainboard'].push(c);
	return out;
}

const keep = (c: ResolvedDeckCard[]) => c;

test('by name: one tile per card per zone, counts keyed by representative rowId', () => {
	const cards = [copy('mainboard'), copy('mainboard', { id: 'print-b' }), copy('sideboard')];
	const { sections, stackByRowId } = buildDeckCardSections(byZone(cards), false, keep, 'none', []);
	const main = sections.find((s) => s.key === 'mainboard')!;
	assert.equal(main.cards.length, 1);
	const rep = main.cards[0] as ResolvedDeckCard;
	assert.equal(stackByRowId.get(rep.entry.rowId)?.copies.length, 2);
	assert.equal(stackByRowId.get(rep.entry.rowId)?.zone, 'mainboard');
});

test('stacks never span zones', () => {
	const cards = [copy('mainboard'), copy('sideboard')];
	const { stackByRowId } = buildDeckCardSections(byZone(cards), false, keep, 'none', []);
	const keys = new Set([...stackByRowId.values()].map((s) => s.selectionKey));
	assert.equal(keys.size, 2);
});

test('finish criterion splits foil and non-foil of the same print inside a zone', () => {
	const foil = copy('mainboard', {}, { isFoil: true });
	const cards = [copy('mainboard'), foil, copy('mainboard')];
	const { sections, stackByRowId } = buildDeckCardSections(byZone(cards), false, keep, 'none', [
		'finish',
	]);
	assert.equal(sections.find((s) => s.key === 'mainboard')!.cards.length, 2);
	assert.equal(stackByRowId.get(foil.entry.rowId)?.copies.length, 1);
});

test('type sub-section totals count copies (keyed by rowId, not print id)', () => {
	const cards = [copy('mainboard'), copy('mainboard', {}, { isFoil: true }), copy('mainboard')];
	const { sections } = buildDeckCardSections(byZone(cards), false, keep, 'type', ['finish']);
	const artifacts = sections
		.find((s) => s.key === 'mainboard')!
		.children!.find((c) => c.key === 'artifact')!;
	assert.equal(artifacts.label, 'Artifacts (3)');
});

test('every copy rowId maps to its stack, tokens included and stacked by name', () => {
	const t1 = copy('tokens', { id: 'tok-a', oracle_id: 'oracle-treasure', name: 'Treasure' });
	const t2 = copy(
		'tokens',
		{ id: 'tok-a', oracle_id: 'oracle-treasure', name: 'Treasure' },
		{ isFoil: true }
	);
	const cards = [copy('mainboard'), t1, t2];
	const { stackByRowId } = buildDeckCardSections(byZone(cards), false, keep, 'none', ['finish']);
	for (const c of cards) assert.ok(stackByRowId.has(c.entry.rowId), c.entry.rowId);
	assert.equal(stackByRowId.get(t2.entry.rowId)?.copies.length, 2);
	assert.equal(stackByRowId.get(t1.entry.rowId), stackByRowId.get(t2.entry.rowId));
});
