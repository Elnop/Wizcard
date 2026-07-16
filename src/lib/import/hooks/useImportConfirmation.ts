'use client';

import { useCallback } from 'react';
import type { ResolvedImportResult, ImportResult } from '@/lib/import/types';
import type { CardEntry } from '@/types/cards';
import type { ImportStatus, ImportProgress } from '@/lib/import/hooks/useImport';
import { getAnalytics } from '@/lib/analytics/context/AnalyticsContext';

export function useImportConfirmation(deps: {
	resolved: ResolvedImportResult | null;
	setStatus: (s: ImportStatus) => void;
	setProgress: (p: ImportProgress) => void;
	setResult: (r: ImportResult) => void;
	importCards: (cards: Array<{ scryfallId: string; entry: CardEntry }>) => void;
	currentCollectionCount: number;
	format: string;
}) {
	const {
		resolved,
		setStatus,
		setProgress,
		setResult,
		importCards,
		currentCollectionCount,
		format,
	} = deps;

	const confirm = useCallback(async () => {
		if (!resolved) return;

		getAnalytics().track({ name: 'import_started', props: { format } });

		const COLLECTION_CAP = 250000;
		const incoming = resolved.resolved.length;
		if (currentCollectionCount + incoming > COLLECTION_CAP) {
			setResult({
				imported: 0,
				notFound: resolved.notFound.length,
				errors: [
					`Cet import de ${incoming} cartes dépasserait la limite de ${COLLECTION_CAP} cartes en collection (${currentCollectionCount} déjà présentes). Réduisez la sélection.`,
				],
			});
			setStatus('error');
			getAnalytics().track({
				name: 'import_failed',
				props: { format, reason: 'collection_cap_exceeded' },
			});
			return;
		}

		try {
			setStatus('merging');
			setProgress({ current: 0, total: resolved.resolved.length });

			const cardsToImport = resolved.resolved.map((card) => ({
				scryfallId: card.id,
				entry: {
					...card.entry,
					rowId: crypto.randomUUID(),
					dateAdded: new Date().toISOString(),
				} satisfies CardEntry,
			}));

			importCards(cardsToImport);

			setResult({
				imported: cardsToImport.length,
				notFound: resolved.notFound.length,
				errors: [],
			});
			setStatus('done');
			getAnalytics().track({
				name: 'import_completed',
				props: { format, cardCount: cardsToImport.length },
			});
		} catch (err) {
			console.error('[Import] unexpected error during import:', err);
			setResult({
				imported: 0,
				notFound: 0,
				errors: [err instanceof Error ? err.message : 'Unknown error'],
			});
			setStatus('error');
			getAnalytics().track({
				name: 'import_failed',
				props: { format, reason: err instanceof Error ? err.message : 'Unknown error' },
			});
		}
	}, [resolved, setStatus, setProgress, setResult, importCards, currentCollectionCount, format]);

	return { confirm };
}
