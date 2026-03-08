'use client';

import { useState, useCallback } from 'react';
import { parseMoxfieldCSV } from '@/lib/moxfield/parse';
import { getCardCollection } from '@/lib/scryfall/endpoints/cards';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { CollectionEntry } from '@/types/card';
import type { ImportResult } from '@/lib/moxfield/types';

export type ImportStatus = 'idle' | 'parsing' | 'fetching' | 'merging' | 'done' | 'error';

export interface ImportProgress {
	current: number;
	total: number;
}

const BATCH_SIZE = 75;

export function useMoxfieldImport(
	importCards: (cards: Array<ScryfallCard & CollectionEntry>) => void
) {
	const [status, setStatus] = useState<ImportStatus>('idle');
	const [progress, setProgress] = useState<ImportProgress>({ current: 0, total: 0 });
	const [result, setResult] = useState<ImportResult | null>(null);
	const [parseErrors, setParseErrors] = useState<string[]>([]);

	const importFile = useCallback(
		async (file: File) => {
			try {
				setStatus('parsing');
				setProgress({ current: 0, total: 0 });
				setResult(null);
				setParseErrors([]);

				const csvText = await file.text();
				const { rows, parseErrors: pErrors } = parseMoxfieldCSV(csvText);
				if (pErrors.length > 0) {
					console.error('[MoxfieldImport] parse errors:', pErrors);
				}
				setParseErrors(pErrors);

				if (rows.length === 0) {
					setResult({ imported: 0, notFound: 0, errors: pErrors });
					setStatus('done');
					return;
				}

				// Build lookup map: "edition/collectorNumber" -> row
				// Duplicate rows (same key) get their counts summed; last row's metadata wins
				const lookup = new Map<string, (typeof rows)[number]>();
				for (const row of rows) {
					const key = `${row.edition.toLowerCase()}/${row.collectorNumber.toLowerCase()}`;
					const existing = lookup.get(key);
					if (existing) {
						lookup.set(key, { ...row, count: existing.count + row.count });
					} else {
						lookup.set(key, row);
					}
				}

				// Chunk into batches of BATCH_SIZE
				const identifiers = Array.from(lookup.entries()).map(([, row]) => ({
					set: row.edition,
					collector_number: row.collectorNumber,
				}));

				const chunks: (typeof identifiers)[] = [];
				for (let i = 0; i < identifiers.length; i += BATCH_SIZE) {
					chunks.push(identifiers.slice(i, i + BATCH_SIZE));
				}

				setStatus('fetching');
				setProgress({ current: 0, total: chunks.length });

				const fetchedCards: ScryfallCard[] = [];
				let notFoundCount = 0;

				for (let i = 0; i < chunks.length; i++) {
					const listResult = await getCardCollection(chunks[i]);
					if (listResult.not_found && listResult.not_found.length > 0) {
						console.error(
							`[MoxfieldImport] batch ${i + 1}/${chunks.length}: ${listResult.not_found.length} cards not found`,
							listResult.not_found
						);
					}
					fetchedCards.push(...listResult.data);
					notFoundCount += listResult.not_found?.length ?? 0;
					setProgress({ current: i + 1, total: chunks.length });
				}

				setStatus('merging');

				// Reconcile fetched cards with lookup map
				const cardsToImport: Array<ScryfallCard & CollectionEntry> = [];

				for (const card of fetchedCards) {
					const key = `${card.set.toLowerCase()}/${card.collector_number.toLowerCase()}`;
					const row = lookup.get(key);
					if (!row) {
						console.error(
							'[MoxfieldImport] fetched card has no matching lookup row:',
							key,
							card.name
						);
						continue;
					}

					cardsToImport.push({
						...card,
						id: card.id,
						quantity: row.count,
						dateAdded: new Date().toISOString(),
						foilType: row.foil === '' ? undefined : row.foil,
						isFoil: row.foil !== '',
						condition: row.condition,
						language: row.language,
						purchasePrice: row.purchasePrice || undefined,
						tradelistCount: row.tradelistCount || undefined,
						alter: row.alter || undefined,
						proxy: row.proxy || undefined,
						tags: row.tags,
					});
				}

				importCards(cardsToImport);

				setResult({
					imported: cardsToImport.length,
					notFound: notFoundCount,
					errors: pErrors,
				});
				setStatus('done');
			} catch (err) {
				console.error('[MoxfieldImport] unexpected error during import:', err);
				setResult({
					imported: 0,
					notFound: 0,
					errors: [err instanceof Error ? err.message : 'Unknown error'],
				});
				setStatus('error');
			}
		},
		[importCards]
	);

	const reset = useCallback(() => {
		setStatus('idle');
		setProgress({ current: 0, total: 0 });
		setResult(null);
		setParseErrors([]);
	}, []);

	return { status, progress, result, parseErrors, importFile, reset };
}
