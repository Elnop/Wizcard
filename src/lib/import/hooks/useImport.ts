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
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';

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

// Where a confirmed import writes its cards. The same modal/pipeline serves both.
export type ImportDestination = 'collection' | 'wishlist';

type ImportCards = (cards: Array<{ scryfallId: string; entry: CardEntry }>) => void;

export function useImport(importers: Record<ImportDestination, ImportCards>) {
	const [status, setStatus] = useState<ImportStatus>('idle');
	const [destination, setDestination] = useState<ImportDestination>('collection');
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

	const { entries } = useCollectionContext();

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
		importCards: importers[destination],
		currentCollectionCount: entries.length,
	});

	const { updateCard, removeCard } = useImportRowEditing({ setResolved });

	const { applyToAll } = useImportBulkApply({ setResolved });

	const changeFormat = useCallback(
		(formatId: ImportFormatId) => {
			fileHandling.changeFormat(formatId, fileText, preview);
		},
		[fileHandling, fileText, preview]
	);

	const openModal = useCallback(
		(dest: ImportDestination = 'collection') => {
			setDestination(dest);
			setStatus('selecting');
			setPreview(null);
			setResult(null);
			setFileText('');
			setResolved(null);
			setIsLoadingPreview(false);
			setPreviewProgress({ current: 0, total: 0 });
			cancelPreviewFetch();
		},
		[cancelPreviewFetch]
	);

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
		destination,
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
