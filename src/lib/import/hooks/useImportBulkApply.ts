'use client';

import { useCallback } from 'react';
import type { ResolvedImportResult } from '@/lib/import/types';
import type { CardEntry } from '@/types/cards';

// Subset of CardEntry that can be applied in bulk to every resolved card.
// `tags` is merged additively; every other field overrides per-card values.
export type BulkApplyPatch = Pick<
	CardEntry,
	'tags' | 'proxy' | 'forTrade' | 'isFoil' | 'foilType' | 'alter' | 'condition' | 'language'
>;

function mergeTags(existing: string[] | undefined, toAdd: string[]): string[] {
	return Array.from(new Set([...(existing ?? []), ...toAdd]));
}

export function useImportBulkApply(deps: {
	setResolved: (
		updater: (prev: ResolvedImportResult | null) => ResolvedImportResult | null
	) => void;
}) {
	const { setResolved } = deps;

	const applyToAll = useCallback(
		(patch: BulkApplyPatch) => {
			setResolved((prev) => {
				if (!prev) return prev;
				const { tags: tagsToAdd, ...overrides } = patch;
				const resolved = prev.resolved.map((card) => {
					const entry: CardEntry = { ...card.entry, ...overrides };
					if (tagsToAdd && tagsToAdd.length > 0) {
						entry.tags = mergeTags(card.entry.tags, tagsToAdd);
					}
					return { ...card, entry };
				});
				return { ...prev, resolved };
			});
		},
		[setResolved]
	);

	return { applyToAll };
}
