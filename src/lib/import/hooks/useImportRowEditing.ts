'use client';

import { useCallback } from 'react';
import type { ParsedImportRow } from '@/lib/import/types';
import type { ImportPreview } from '@/lib/import/hooks/useImport';

export function useImportRowEditing(deps: {
	setPreview: (updater: (prev: ImportPreview | null) => ImportPreview | null) => void;
}) {
	const { setPreview } = deps;

	const updateRow = useCallback(
		(rowIndex: number, updates: Partial<ParsedImportRow>) => {
			setPreview((prev) => {
				if (!prev) return prev;
				const newRows = [...prev.parsed.rows];
				newRows[rowIndex] = { ...newRows[rowIndex], ...updates };
				return { ...prev, parsed: { ...prev.parsed, rows: newRows } };
			});
		},
		[setPreview]
	);

	const removeRow = useCallback(
		(rowIndex: number) => {
			setPreview((prev) => {
				if (!prev) return prev;
				const newRows = prev.parsed.rows.filter((_, i) => i !== rowIndex);
				return { ...prev, parsed: { ...prev.parsed, rows: newRows } };
			});
		},
		[setPreview]
	);

	return { updateRow, removeRow };
}
