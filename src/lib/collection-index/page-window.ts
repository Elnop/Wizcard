import type { Card, CardStack, FacetStack } from '@/types/cards';
import type { CustomCard } from '@/lib/mpc/types';

type CardMap = ReadonlyMap<string, Card | CustomCard>;

/** Unique print ids of every copy of `stacks[0..end)`, in display order. */
export function windowIds(stacks: FacetStack[], end: number): string[] {
	const seen = new Set<string>();
	for (const stack of stacks.slice(0, end)) for (const c of stack.cards) seen.add(c.id);
	return [...seen];
}

/** A renderable stack once EVERY copy's full card is known, else null. */
export function toCardStack(stack: FacetStack, cards: CardMap): CardStack | null {
	const full: CardStack['cards'] = [];
	for (const copy of stack.cards) {
		const card = cards.get(copy.id);
		if (!card) return null;
		full.push({ ...card, entry: copy.entry });
	}
	return { oracleId: stack.oracleId, name: stack.name, cards: full };
}

/** True when stacks[from..to) are all renderable (an empty range is ready). */
export function rangeReady(
	stacks: FacetStack[],
	from: number,
	to: number,
	cards: CardMap
): boolean {
	for (const stack of stacks.slice(from, to)) {
		for (const copy of stack.cards) if (!cards.has(copy.id)) return false;
	}
	return true;
}
