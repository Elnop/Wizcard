'use client';

import { useState, useCallback } from 'react';
import { ALL_FORMATS } from '@/lib/import/formats/registry';
import type { ImportFormatId, ImportResult } from '@/lib/import/types';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { CardEntry } from '@/types/cards';
import { useImportPreviewFetch } from '@/lib/import/hooks/useImportPreviewFetch';
import { useImportFileHandling } from '@/lib/import/hooks/useImportFileHandling';
import { useImportConfirmation } from '@/lib/import/hooks/useImportConfirmation';
import { useImportRowEditing } from '@/lib/import/hooks/useImportRowEditing';
import { useSetCodeNormalizer } from '@/lib/import/hooks/useSetCodeNormalizer';

export type ImportStatus =
	| 'idle'
	| 'selecting'
	| 'parsing'
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
	parsed: import('@/lib/import/types').ParsedImportResult;
}

export function useImport(
	importCards: (cards: Array<{ scryfallId: string; entry: CardEntry }>) => void
) {
	const [status, setStatus] = useState<ImportStatus>('idle');
	const [progress, setProgress] = useState<ImportProgress>({ current: 0, total: 0 });
	const [result, setResult] = useState<ImportResult | null>(null);
	const [preview, setPreview] = useState<ImportPreview | null>(null);
	const [fileText, setFileText] = useState<string>('');
	const [fetchedCards, setFetchedCards] = useState<ScryfallCard[]>([]);
	const [isLoadingPreview, setIsLoadingPreview] = useState(false);
	const [previewProgress, setPreviewProgress] = useState<ImportProgress>({
		current: 0,
		total: 0,
	});

	const normalizeSetCodes = useSetCodeNormalizer();

	const { fetchPreviewCards, cancelPreviewFetch } = useImportPreviewFetch({
		setFetchedCards,
		setIsLoadingPreview,
		setPreviewProgress,
		normalizeSetCodes,
	});

	const fileHandling = useImportFileHandling({
		setFileText,
		setStatus,
		setPreview,
		fetchPreviewCards,
		cancelPreviewFetch,
	});

	const { confirm } = useImportConfirmation({
		fetchedCards,
		preview,
		setStatus,
		setProgress,
		setResult,
		importCards,
		normalizeSetCodes,
	});

	const { updateRow, removeRow } = useImportRowEditing({ setPreview });

	const changeFormat = useCallback(
		(formatId: ImportFormatId) => {
			fileHandling.changeFormat(formatId, fileText, preview);
		},
		[fileHandling, fileText, preview]
	);

	const openModal = useCallback(() => {
		setStatus('selecting');
		setPreview(null);
		setResult(null);
		setFileText('');
		setFetchedCards([]);
		setIsLoadingPreview(false);
		setPreviewProgress({ current: 0, total: 0 });
		cancelPreviewFetch();
	}, [cancelPreviewFetch]);

	const cancel = useCallback(() => {
		cancelPreviewFetch();
		setStatus('idle');
		setPreview(null);
		setFileText('');
		setFetchedCards([]);
		setIsLoadingPreview(false);
	}, [cancelPreviewFetch]);

	const reset = useCallback(() => {
		setStatus('idle');
		setProgress({ current: 0, total: 0 });
		setResult(null);
		setPreview(null);
		setFileText('');
		setFetchedCards([]);
		setIsLoadingPreview(false);
		setPreviewProgress({ current: 0, total: 0 });
		cancelPreviewFetch();
	}, [cancelPreviewFetch]);

	return {
		status,
		progress,
		result,
		preview,
		fetchedCards,
		isLoadingPreview,
		previewProgress,
		openModal,
		selectFile: fileHandling.selectFile,
		submitText: fileHandling.submitText,
		changeFormat,
		confirm,
		cancel,
		reset,
		updateRow,
		removeRow,
		formatRegistry: ALL_FORMATS,
	};
}
