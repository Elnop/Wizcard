import type { StackBy } from '@/types/cards';
import { STACK_CRITERIA } from '@/lib/card/utils/group-cards';

/**
 * Parses a stored stacking value (DB text[] or localStorage JSON) into a StackBy.
 * Anything invalid — non-array, unknown values only, 'copy' mixed with criteria —
 * falls back to [] (by name) rather than throwing.
 */
export function stackByFromArray(value: unknown): StackBy {
	if (!Array.isArray(value)) return [];
	if (value.includes('copy')) return value.length === 1 ? 'copy' : [];
	return STACK_CRITERIA.filter((c) => value.includes(c));
}

/** Serialises a StackBy to the stored text[] form, criteria in canonical order. */
export function stackByToArray(value: StackBy): string[] {
	if (value === 'copy') return ['copy'];
	return STACK_CRITERIA.filter((c) => value.includes(c));
}
