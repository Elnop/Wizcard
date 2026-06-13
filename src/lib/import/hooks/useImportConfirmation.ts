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

	// eslint-disable-next-line sonarjs/cognitive-complexity -- import confirmation pipeline: normalize → fetch → merge, inherently sequential
	const confirm = useCallback(async () => {
		if (!preview) return;

		try {
			const parsed = normalizeSetCodes(preview.parsed);

			if (parsed.rows.length === 0) {
				setResult({ imported: 0, notFound: 0, errors: parsed.parseErrors });
				setStatus('done');
				return;
			}

			// Build lookup map — key includes lang + foil so each physical variant maps to its own rows.
			const lookup = new Map<string, ParsedImportRow[]>();
			for (const row of parsed.rows) {
				const foilKey = row.foil || 'nonfoil';
				const langKey =
					row.language && row.language !== 'en' ? `/${row.language.toLowerCase()}` : '';
				let key: string;
				if (row.set && row.collectorNumber) {
					key = `${row.set.toLowerCase()}/${row.collectorNumber.toLowerCase()}${langKey}/${foilKey}`;
				} else if (row.set) {
					key = `name:${row.name.toLowerCase()}/set:${row.set.toLowerCase()}${langKey}/${foilKey}`;
				} else {
					key = `name:${row.name.toLowerCase()}${langKey}/${foilKey}`;
				}
				const existing = lookup.get(key);
				if (existing) {
					existing.push(row);
				} else {
					lookup.set(key, [row]);
				}
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
				const setBase = `${card.set.toLowerCase()}/${card.collector_number.toLowerCase()}`;
				const nameSetBase = `name:${card.name.toLowerCase()}/set:${card.set.toLowerCase()}`;
				const nameBase = `name:${card.name.toLowerCase()}`;
				const cardLang = card.lang && card.lang !== 'en' ? `/${card.lang.toLowerCase()}` : '';

				// Collect all rows for this card across all foil variants and the card's language
				const allRows: ParsedImportRow[] = [];
				for (const foilKey of ['foil', 'etched', 'nonfoil']) {
					const bySet =
						lookup.get(`${setBase}${cardLang}/${foilKey}`) ?? lookup.get(`${setBase}/${foilKey}`);
					if (bySet) {
						allRows.push(...bySet);
						continue;
					}
					const byNameSet =
						lookup.get(`${nameSetBase}${cardLang}/${foilKey}`) ??
						lookup.get(`${nameSetBase}/${foilKey}`);
					if (byNameSet) {
						allRows.push(...byNameSet);
						continue;
					}
					const byName =
						lookup.get(`${nameBase}${cardLang}/${foilKey}`) ?? lookup.get(`${nameBase}/${foilKey}`);
					if (byName) allRows.push(...byName);
				}

				if (allRows.length === 0) {
					console.error(
						'[Import] fetched card has no matching lookup row:',
						card.name,
						card.set,
						card.collector_number
					);
					continue;
				}

				// One CardEntry per physical copy, preserving foil/nonfoil per row
				for (const row of allRows) {
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
