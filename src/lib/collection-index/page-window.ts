import type { Card, CardStack, FacetStack } from '@/types/cards';
import type { CustomCard } from '@/lib/mpc/types';

type CardMap = ReadonlyMap<string, Card | CustomCard>;

/** Unique print ids of every copy of `stacks[0..end)`, in display order. */
export function windowIds(stacks: FacetStack[], end: number): string[] {
	const seen = new Set<string>();
	for (const stack of stacks.slice(0, end)) for (const c of stack.cards) seen.add(c.id);
	return [...seen];
}

/**
 * A renderable stack once every non-excluded copy's full card is known, else
 * null. An excluded copy (unresolvable after repeated attempts) is dropped
 * instead of blocking the stack; a stack left with no copies is dropped too.
 */
export function toCardStack(
	stack: FacetStack,
	cards: CardMap,
	excluded: ReadonlySet<string>
): CardStack | null {
	const full: CardStack['cards'] = [];
	for (const copy of stack.cards) {
		if (excluded.has(copy.id)) continue;
		const card = cards.get(copy.id);
		if (!card) return null;
		full.push({ ...card, entry: copy.entry });
	}
	if (full.length === 0) return null;
	return { oracleId: stack.oracleId, name: stack.name, cards: full };
}

/**
 * True when stacks[from..to) are all renderable (an empty range is ready).
 * Excluded copies never gate readiness — they are skipped, as `toCardStack`
 * skips them.
 */
export function rangeReady(
	stacks: FacetStack[],
	from: number,
	to: number,
	cards: CardMap,
	excluded: ReadonlySet<string>
): boolean {
	for (const stack of stacks.slice(from, to)) {
		for (const copy of stack.cards) {
			if (excluded.has(copy.id)) continue;
			if (!cards.has(copy.id)) return false;
		}
	}
	return true;
}
