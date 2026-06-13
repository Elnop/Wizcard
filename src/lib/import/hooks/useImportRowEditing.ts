'use client';

import { useCallback } from 'react';
import type { ResolvedImportResult } from '@/lib/import/types';
import type { CardEntry } from '@/types/cards';

export function useImportRowEditing(deps: {
	setResolved: (
		updater: (prev: ResolvedImportResult | null) => ResolvedImportResult | null
	) => void;
}) {
	const { setResolved } = deps;

	const updateCard = useCallback(
		(cardIndex: number, updates: Partial<CardEntry>) => {
			setResolved((prev) => {
				if (!prev) return prev;
				const newResolved = [...prev.resolved];
				newResolved[cardIndex] = {
					...newResolved[cardIndex],
					entry: { ...newResolved[cardIndex].entry, ...updates },
				};
				return { ...prev, resolved: newResolved };
			});
		},
		[setResolved]
	);

	const removeCard = useCallback(
		(cardIndex: number) => {
			setResolved((prev) => {
				if (!prev) return prev;
				const newResolved = prev.resolved.filter((_, i) => i !== cardIndex);
				return { ...prev, resolved: newResolved };
			});
		},
		[setResolved]
	);

	return { updateCard, removeCard };
}
