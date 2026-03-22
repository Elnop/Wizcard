'use client';

import { useState, useCallback, useRef } from 'react';
import { detectFormat } from '@/lib/import/detect';
import { getParser, FORMAT_REGISTRY } from '@/lib/import/formats';
import { getCardCollection } from '@/lib/scryfall/endpoints/cards';
import type {
	ImportFormatId,
	ParsedImportRow,
	ParsedImportResult,
	ImportResult,
} from '@/lib/import/types';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { CardEntry } from '@/types/cards';
import { deduplicateIdentifiers } from '@/lib/import/identifier-dedup';

export type ImportStatus =
	| 'idle'
	| 'selecting'
	| 'previewing'
	| 'fetching'
	| 'merging'
	| 'done'
	| 'error';

export interface ImportProgress {
	current: number;
	total: number;
}

export interface ImportPreview {
	fileName: string;
	fileSize: number;
	detectedFormat: ImportFormatId;
	scores: Record<ImportFormatId, number>;
	parsed: ParsedImportResult;
}

const BATCH_SIZE = 75;

function mergeRows(rows: ParsedImportRow[]): ParsedImportRow[] {
	const map = new Map<string, ParsedImportRow>();
	for (const row of rows) {
		const key =
			row.set && row.collectorNumber
				? `${row.set.toLowerCase()}/${row.collectorNumber.toLowerCase()}`
				: `name:${row.name.toLowerCase()}`;
		const existing = map.get(key);
		if (existing) {
			existing.quantity += row.quantity;
		} else {
			map.set(key, { ...row });
		}
	}
	return Array.from(map.values());
}

export function useImport(
	importCards: (cards: Array<{ scryfallId: string; entry: CardEntry }>) => void
) {
	const [status, setStatus] = useState<ImportStatus>('idle');
	const [progress, setProgress] = useState<ImportProgress>({ current: 0, total: 0 });
	const [result, setResult] = useState<ImportResult | null>(null);
	const [preview, setPreview] = useState<ImportPreview | null>(null);
	const [fileText, setFileText] = useState<string>('');

	// Preview fetch state
	const [fetchedCards, setFetchedCards] = useState<ScryfallCard[]>([]);
	const [isLoadingPreview, setIsLoadingPreview] = useState(false);
	const [previewProgress, setPreviewProgress] = useState<ImportProgress>({
		current: 0,
		total: 0,
	});
	const abortRef = useRef(false);

	const fetchPreviewCards = useCallback(async (parsed: ParsedImportResult) => {
		if (parsed.rows.length === 0) return;

		const identifiers = deduplicateIdentifiers(parsed.identifiers);

		const chunks: (typeof identifiers)[] = [];
		for (let i = 0; i < identifiers.length; i += BATCH_SIZE) {
			chunks.push(identifiers.slice(i, i + BATCH_SIZE));
		}

		abortRef.current = false;
		setIsLoadingPreview(true);
		setPreviewProgress({ current: 0, total: chunks.length });
		setFetchedCards([]);

		const cards: ScryfallCard[] = [];

		for (let i = 0; i < chunks.length; i++) {
			if (abortRef.current) break;
			const listResult = await getCardCollection(chunks[i]);
			if (listResult.not_found && listResult.not_found.length > 0) {
				console.error(
					`[Import preview] batch ${i + 1}/${chunks.length}: ${listResult.not_found.length} cards not found`,
					listResult.not_found
				);
			}
			cards.push(...listResult.data);
			setPreviewProgress({ current: i + 1, total: chunks.length });
		}

		if (!abortRef.current) {
			setFetchedCards(cards);
		}
		setIsLoadingPreview(false);
	}, []);

	const openModal = useCallback(() => {
		setStatus('selecting');
		setPreview(null);
		setResult(null);
		setFileText('');
		setFetchedCards([]);
		setIsLoadingPreview(false);
		setPreviewProgress({ current: 0, total: 0 });
		abortRef.current = true;
	}, []);

	const selectFile = useCallback(
		async (file: File) => {
			const text = await file.text();
			setFileText(text);

			const { formatId, scores } = detectFormat(text, file.name);
			const parser = getParser(formatId);
			const parsed = parser(text);
			const mergedRows = mergeRows(parsed.rows);
			const mergedParsed = { ...parsed, rows: mergedRows };

			setPreview({
				fileName: file.name,
				fileSize: file.size,
				detectedFormat: formatId,
				scores,
				parsed: mergedParsed,
			});
			setStatus('previewing');
			void fetchPreviewCards(parsed);
		},
		[fetchPreviewCards]
	);

	const submitText = useCallback(
		(text: string) => {
			setFileText(text);

			const { formatId, scores } = detectFormat(text);
			const parser = getParser(formatId);
			const parsed = parser(text);
			const mergedRows = mergeRows(parsed.rows);
			const mergedParsed = { ...parsed, rows: mergedRows };

			setPreview({
				fileName: 'Collage texte',
				fileSize: new Blob([text]).size,
				detectedFormat: formatId,
				scores,
				parsed: mergedParsed,
			});
			setStatus('previewing');
			void fetchPreviewCards(parsed);
		},
		[fetchPreviewCards]
	);

	const changeFormat = useCallback(
		(formatId: ImportFormatId) => {
			if (!preview) return;
			const parser = getParser(formatId);
			const parsed = parser(fileText);
			const mergedRows = mergeRows(parsed.rows);
			const mergedParsed = { ...parsed, rows: mergedRows };
			setPreview({ ...preview, detectedFormat: formatId, parsed: mergedParsed });
			// Re-launch preview fetch with new parsed result
			abortRef.current = true;
			void fetchPreviewCards(parsed);
		},
		[preview, fileText, fetchPreviewCards]
	);

	const confirm = useCallback(async () => {
		if (!preview) return;

		try {
			const { parsed } = preview;

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
	}, [preview, importCards, fetchedCards]);

	const reset = useCallback(() => {
		setStatus('idle');
		setProgress({ current: 0, total: 0 });
		setResult(null);
		setPreview(null);
		setFileText('');
		setFetchedCards([]);
		setIsLoadingPreview(false);
		setPreviewProgress({ current: 0, total: 0 });
		abortRef.current = true;
	}, []);

	const updateRow = useCallback((rowIndex: number, updates: Partial<ParsedImportRow>) => {
		setPreview((prev) => {
			if (!prev) return prev;
			const newRows = [...prev.parsed.rows];
			newRows[rowIndex] = { ...newRows[rowIndex], ...updates };
			return { ...prev, parsed: { ...prev.parsed, rows: newRows } };
		});
	}, []);

	const removeRow = useCallback((rowIndex: number) => {
		setPreview((prev) => {
			if (!prev) return prev;
			const newRows = prev.parsed.rows.filter((_, i) => i !== rowIndex);
			return { ...prev, parsed: { ...prev.parsed, rows: newRows } };
		});
	}, []);

	const cancel = useCallback(() => {
		setStatus('idle');
		setPreview(null);
		setFileText('');
		setFetchedCards([]);
		setIsLoadingPreview(false);
		abortRef.current = true;
	}, []);

	return {
		status,
		progress,
		result,
		preview,
		fetchedCards,
		isLoadingPreview,
		previewProgress,
		openModal,
		selectFile,
		submitText,
		changeFormat,
		confirm,
		cancel,
		reset,
		updateRow,
		removeRow,
		formatRegistry: FORMAT_REGISTRY,
	};
}
