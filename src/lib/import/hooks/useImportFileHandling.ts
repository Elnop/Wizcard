'use client';

import { useCallback } from 'react';
import { detectFormat, detectBinaryFormat } from '@/lib/import/utils/detect';
import { getParser, getBinaryParser } from '@/lib/import/formats/registry';
import { isBinaryFormat } from '@/lib/import/types';
import type { ImportFormatId, ParsedImportResult } from '@/lib/import/types';
import type { ImportStatus, ImportPreview } from '@/lib/import/hooks/useImport';

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
			const binaryFormatId =
				forcedFormatId && isBinaryFormat(forcedFormatId)
					? forcedFormatId
					: detectBinaryFormat(file.name);

			if (binaryFormatId) {
				setFileText('');
				setStatus('parsing');
				try {
					const buffer = await file.arrayBuffer();
					const parser = getBinaryParser(binaryFormatId);
					if (!parser) throw new Error(`Pas de parser pour ${binaryFormatId}`);
					const parsed = await parser(buffer);
					setPreview({
						fileName: file.name,
						fileSize: file.size,
						detectedFormat: binaryFormatId,
						scores: { [binaryFormatId]: 1 } as Record<ImportFormatId, number>,
						parsed,
					});
					setStatus('previewing');
					void fetchPreviewCards(parsed);
				} catch {
					setStatus('error');
				}
				return;
			}

			const text = await file.text();
			setFileText(text);
			setStatus('parsing');

			setTimeout(() => {
				const { formatId, scores } = forcedFormatId
					? { formatId: forcedFormatId, scores: {} as Record<ImportFormatId, number> }
					: detectFormat(text, file.name);
				const parser = getParser(formatId);
				if (!parser) return;
				const parsed = parser(text);

				setPreview({
					fileName: file.name,
					fileSize: file.size,
					detectedFormat: formatId,
					scores,
					parsed,
				});
				setStatus('previewing');
				void fetchPreviewCards(parsed);
			}, 0);
		},
		[setFileText, setPreview, setStatus, fetchPreviewCards]
	);

	const submitText = useCallback(
		(text: string, forcedFormatId?: ImportFormatId) => {
			setFileText(text);
			setStatus('parsing');

			setTimeout(() => {
				const { formatId, scores } = forcedFormatId
					? { formatId: forcedFormatId, scores: {} as Record<ImportFormatId, number> }
					: detectFormat(text);
				const parser = getParser(formatId);
				if (!parser) return;
				const parsed = parser(text);

				setPreview({
					fileName: 'Collage texte',
					fileSize: new Blob([text]).size,
					detectedFormat: formatId,
					scores,
					parsed,
				});
				setStatus('previewing');
				void fetchPreviewCards(parsed);
			}, 0);
		},
		[setFileText, setPreview, setStatus, fetchPreviewCards]
	);

	const changeFormat = useCallback(
		(formatId: ImportFormatId, fileText: string, currentPreview: ImportPreview | null) => {
			if (!currentPreview || isBinaryFormat(formatId)) return;
			const parser = getParser(formatId);
			if (!parser) return;
			const parsed = parser(fileText);
			setPreview({ ...currentPreview, detectedFormat: formatId, parsed });
			cancelPreviewFetch();
			void fetchPreviewCards(parsed);
		},
		[setPreview, cancelPreviewFetch, fetchPreviewCards]
	);

	return { selectFile, submitText, changeFormat };
}
