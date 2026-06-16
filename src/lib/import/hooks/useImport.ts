'use client';

import { useState, useCallback } from 'react';
import { ALL_FORMATS } from '@/lib/import/formats/registry';
import type { ImportFormatId, ImportResult, ResolvedImportResult } from '@/lib/import/types';
import type { CardEntry } from '@/types/cards';
import { useImportPreviewFetch } from '@/lib/import/hooks/useImportPreviewFetch';
import { useImportFileHandling } from '@/lib/import/hooks/useImportFileHandling';
import { useImportConfirmation } from '@/lib/import/hooks/useImportConfirmation';
import { useImportRowEditing } from '@/lib/import/hooks/useImportRowEditing';
import { useImportBulkApply } from '@/lib/import/hooks/useImportBulkApply';
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
	const [resolved, setResolved] = useState<ResolvedImportResult | null>(null);
	const [isLoadingPreview, setIsLoadingPreview] = useState(false);
	const [previewProgress, setPreviewProgress] = useState<ImportProgress>({
		current: 0,
		total: 0,
	});

	// Collection import only needs PendingCard[] normalization; the rows+identifiers
	// variant (normalize) is consumed directly by ImportDeckModal via the hook.
	const { normalizePending } = useSetCodeNormalizer();

	const { fetchPreviewCards, cancelPreviewFetch } = useImportPreviewFetch({
		setResolved,
		setIsLoadingPreview,
		setPreviewProgress,
		normalizePending,
	});

	const fileHandling = useImportFileHandling({
		setFileText,
		setStatus,
		setPreview,
		fetchPreviewCards,
		cancelPreviewFetch,
	});

	const { confirm } = useImportConfirmation({
		resolved,
		setStatus,
		setProgress,
		setResult,
		importCards,
	});

	const { updateCard, removeCard } = useImportRowEditing({ setResolved });

	const { applyToAll } = useImportBulkApply({ setResolved });

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
		setResolved(null);
		setIsLoadingPreview(false);
		setPreviewProgress({ current: 0, total: 0 });
		cancelPreviewFetch();
	}, [cancelPreviewFetch]);

	const cancel = useCallback(() => {
		cancelPreviewFetch();
		setStatus('idle');
		setPreview(null);
		setFileText('');
		setResolved(null);
		setIsLoadingPreview(false);
	}, [cancelPreviewFetch]);

	const reset = useCallback(() => {
		setStatus('idle');
		setProgress({ current: 0, total: 0 });
		setResult(null);
		setPreview(null);
		setFileText('');
		setResolved(null);
		setIsLoadingPreview(false);
		setPreviewProgress({ current: 0, total: 0 });
		cancelPreviewFetch();
	}, [cancelPreviewFetch]);

	return {
		status,
		progress,
		result,
		preview,
		resolved,
		isLoadingPreview,
		previewProgress,
		openModal,
		selectFile: fileHandling.selectFile,
		submitText: fileHandling.submitText,
		changeFormat,
		confirm,
		cancel,
		reset,
		updateCard,
		removeCard,
		applyToAll,
		formatRegistry: ALL_FORMATS,
	};
}
