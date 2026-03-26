'use client';

import { useCallback } from 'react';
import { detectFormat } from '@/lib/import/utils/detect';
import { getParser } from '@/lib/import/formats/registry';
import type { ImportFormatId, ParsedImportRow, ParsedImportResult } from '@/lib/import/utils/types';
import type { ImportStatus, ImportPreview } from '@/lib/import/hooks/useImport';

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

export function useImportFileHandling(deps: {
	setFileText: (t: string) => void;
	setStatus: (s: ImportStatus) => void;
	setPreview: (p: ImportPreview | null) => void;
	fetchPreviewCards: (parsed: ParsedImportResult) => void;
	cancelPreviewFetch: () => void;
}) {
	const { setFileText, setStatus, setPreview, fetchPreviewCards, cancelPreviewFetch } = deps;

	const selectFile = useCallback(
		async (file: File, forcedFormatId?: ImportFormatId) => {
			const text = await file.text();
			setFileText(text);

			const { formatId, scores } = forcedFormatId
				? { formatId: forcedFormatId, scores: {} as Record<ImportFormatId, number> }
				: detectFormat(text, file.name);
			const parser = getParser(formatId);
			const parsed = parser(text);
			const mergedRows = mergeRows(parsed.rows);
			const mergedParsed: ParsedImportResult = { ...parsed, rows: mergedRows };

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
		[setFileText, setPreview, setStatus, fetchPreviewCards]
	);

	const submitText = useCallback(
		(text: string, forcedFormatId?: ImportFormatId) => {
			setFileText(text);

			const { formatId, scores } = forcedFormatId
				? { formatId: forcedFormatId, scores: {} as Record<ImportFormatId, number> }
				: detectFormat(text);
			const parser = getParser(formatId);
			const parsed = parser(text);
			const mergedRows = mergeRows(parsed.rows);
			const mergedParsed: ParsedImportResult = { ...parsed, rows: mergedRows };

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
		[setFileText, setPreview, setStatus, fetchPreviewCards]
	);

	const changeFormat = useCallback(
		(formatId: ImportFormatId, fileText: string, currentPreview: ImportPreview | null) => {
			if (!currentPreview) return;
			const parser = getParser(formatId);
			const parsed = parser(fileText);
			const mergedRows = mergeRows(parsed.rows);
			const mergedParsed: ParsedImportResult = { ...parsed, rows: mergedRows };
			setPreview({ ...currentPreview, detectedFormat: formatId, parsed: mergedParsed });
			cancelPreviewFetch();
			void fetchPreviewCards(parsed);
		},
		[setPreview, cancelPreviewFetch, fetchPreviewCards]
	);

	return { selectFile, submitText, changeFormat };
}
