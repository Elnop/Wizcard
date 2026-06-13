'use client';

import { useRef, useCallback } from 'react';
import { getCardCollection } from '@/lib/scryfall/endpoints/cards';
import { BATCH_SIZE } from '@/lib/scryfall/constants';
import { deduplicateIdentifiers } from '@/lib/import/utils/identifier-dedup';
import type { ParsedImportResult } from '@/lib/import/types';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { ImportProgress } from '@/lib/import/hooks/useImport';

export function useImportPreviewFetch(deps: {
	setFetchedCards: (cards: ScryfallCard[]) => void;
	setIsLoadingPreview: (b: boolean) => void;
	setPreviewProgress: (p: ImportProgress) => void;
	normalizeSetCodes: (parsed: ParsedImportResult) => ParsedImportResult;
}) {
	const { setFetchedCards, setIsLoadingPreview, setPreviewProgress, normalizeSetCodes } = deps;
	const abortRef = useRef(false);

	const cancelPreviewFetch = useCallback(() => {
		abortRef.current = true;
	}, []);

	const fetchPreviewCards = useCallback(
		async (parsed: ParsedImportResult) => {
			if (parsed.rows.length === 0) return;

			const normalized = normalizeSetCodes(parsed);
			const identifiers = deduplicateIdentifiers(normalized.identifiers);

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
					const lines = listResult.not_found.map((id) => {
						if ('set' in id && 'collector_number' in id) {
							const langPart = id.lang ? ` lang=${id.lang}` : '';
							return `  • set=${id.set} num=${id.collector_number}${langPart}`;
						}
						if ('name' in id && 'set' in id) return `  • name="${id.name}" set=${id.set}`;
						if ('name' in id) return `  • name="${id.name}"`;
						return `  • ${JSON.stringify(id)}`;
					});
					console.warn(
						`[Import preview] batch ${i + 1}/${chunks.length}: ${listResult.not_found.length} not found:\n${lines.join('\n')}`
					);
				}
				cards.push(...listResult.data);
				setPreviewProgress({ current: i + 1, total: chunks.length });
			}

			if (!abortRef.current) {
				// Deduplicate by Scryfall ID — same card can appear from multiple identifiers
				const seen = new Set<string>();
				const deduped = cards.filter((c) => {
					if (seen.has(c.id)) return false;
					seen.add(c.id);
					return true;
				});
				setFetchedCards(deduped);
			}
			setIsLoadingPreview(false);
		},
		[setFetchedCards, setIsLoadingPreview, setPreviewProgress, normalizeSetCodes]
	);

	return { fetchPreviewCards, cancelPreviewFetch };
}
