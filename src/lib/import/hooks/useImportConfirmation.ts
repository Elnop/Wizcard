'use client';

import { useCallback } from 'react';
import { getCardCollection } from '@/lib/scryfall/endpoints/cards';
import { BATCH_SIZE } from '@/lib/scryfall/constants';
import { deduplicateIdentifiers } from '@/lib/import/utils/identifier-dedup';
import type { ParsedImportRow, ParsedImportResult, ImportResult } from '@/lib/import/types';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { CardEntry } from '@/types/cards';
import type { ImportStatus, ImportPreview, ImportProgress } from '@/lib/import/hooks/useImport';

export function useImportConfirmation(deps: {
	fetchedCards: ScryfallCard[];
	preview: ImportPreview | null;
	setStatus: (s: ImportStatus) => void;
	setProgress: (p: ImportProgress) => void;
	setResult: (r: ImportResult) => void;
	importCards: (cards: Array<{ scryfallId: string; entry: CardEntry }>) => void;
	normalizeSetCodes: (parsed: ParsedImportResult) => ParsedImportResult;
}) {
	const {
		fetchedCards,
		preview,
		setStatus,
		setProgress,
		setResult,
		importCards,
		normalizeSetCodes,
	} = deps;

	const confirm = useCallback(async () => {
		if (!preview) return;

		try {
			const parsed = normalizeSetCodes(preview.parsed);

			if (parsed.rows.length === 0) {
				setResult({ imported: 0, notFound: 0, errors: parsed.parseErrors });
				setStatus('done');
				return;
			}

			// Build lookup map — rows are already deduplicated by mergeRows
			const lookup = new Map<string, ParsedImportRow>();
			for (const row of parsed.rows) {
				const key =
					row.set && row.collectorNumber
						? `${row.set.toLowerCase()}/${row.collectorNumber.toLowerCase()}`
						: row.set
							? `name:${row.name.toLowerCase()}/set:${row.set.toLowerCase()}`
							: `name:${row.name.toLowerCase()}`;
				lookup.set(key, row);
			}

			// Use already-fetched cards if available, otherwise fetch now
			let cards: ScryfallCard[];
			let notFoundCount = 0;

			if (fetchedCards.length > 0) {
				cards = fetchedCards;
			} else {
				const identifiers = deduplicateIdentifiers(parsed.identifiers);

				const chunks: (typeof identifiers)[] = [];
				for (let i = 0; i < identifiers.length; i += BATCH_SIZE) {
					chunks.push(identifiers.slice(i, i + BATCH_SIZE));
				}

				setStatus('fetching');
				setProgress({ current: 0, total: chunks.length });

				cards = [];

				for (let i = 0; i < chunks.length; i++) {
					const listResult = await getCardCollection(chunks[i]);
					if (listResult.not_found && listResult.not_found.length > 0) {
						console.error(
							`[Import] batch ${i + 1}/${chunks.length}: ${listResult.not_found.length} cards not found`,
							listResult.not_found
						);
					}
					cards.push(...listResult.data);
					notFoundCount += listResult.not_found?.length ?? 0;
					setProgress({ current: i + 1, total: chunks.length });
				}
			}

			setStatus('merging');

			const cardsToImport: Array<{ scryfallId: string; entry: CardEntry }> = [];

			for (const card of cards) {
				// Try set/collector_number key first
				const setKey = `${card.set.toLowerCase()}/${card.collector_number.toLowerCase()}`;
				let row = lookup.get(setKey);

				// Fallback to name/set key
				if (!row) {
					const nameSetKey = `name:${card.name.toLowerCase()}/set:${card.set.toLowerCase()}`;
					row = lookup.get(nameSetKey);
				}

				// Fallback to name-only key
				if (!row) {
					const nameKey = `name:${card.name.toLowerCase()}`;
					row = lookup.get(nameKey);
				}

				if (!row) {
					console.error(
						'[Import] fetched card has no matching lookup row:',
						card.name,
						card.set,
						card.collector_number
					);
					continue;
				}

				// One CardEntry per physical copy
				for (let i = 0; i < row.quantity; i++) {
					cardsToImport.push({
						scryfallId: card.id,
						entry: {
							rowId: crypto.randomUUID(),
							dateAdded: new Date().toISOString(),
							foilType: row.foil || undefined,
							isFoil: !!row.foil,
							condition: row.condition as CardEntry['condition'],
							language: row.language as CardEntry['language'],
							purchasePrice: row.purchasePrice || undefined,
							forTrade: row.forTrade || undefined,
							alter: row.alter || undefined,
							proxy: row.proxy || undefined,
							tags: row.tags,
						},
					});
				}
			}

			importCards(cardsToImport);

			setResult({
				imported: cardsToImport.length,
				notFound: notFoundCount,
				errors: parsed.parseErrors,
			});
			setStatus('done');
		} catch (err) {
			console.error('[Import] unexpected error during import:', err);
			setResult({
				imported: 0,
				notFound: 0,
				errors: [err instanceof Error ? err.message : 'Unknown error'],
			});
			setStatus('error');
		}
	}, [preview, fetchedCards, setStatus, setProgress, setResult, importCards, normalizeSetCodes]);

	return { confirm };
}
