'use client';

import { useRef, useCallback } from 'react';
import { getCardCollection } from '@/lib/scryfall/endpoints/cards';
import { BATCH_SIZE } from '@/lib/scryfall/constants';
import {
	buildFetchIdentifiers,
	buildPendingIdentifier,
	buildIdentifierKey,
} from '@/lib/import/utils/identifier-dedup';
import { preferPrint } from '@/lib/card/utils/prefer-print';
import type { ParsedImportResult, PendingCard, ResolvedImportResult } from '@/lib/import/types';
import type { ScryfallCard, ScryfallCardIdentifier } from '@/lib/scryfall/types/scryfall';
import type { Card, CardEntry } from '@/types/cards';
import type { ImportProgress } from '@/lib/import/hooks/useImport';

interface ScryfallLookup {
	bySetNum: Map<string, ScryfallCard>;
	byNameSet: Map<string, ScryfallCard>;
	byName: Map<string, ScryfallCard>;
}

function buildLookup(scryfallCards: ScryfallCard[]): ScryfallLookup {
	const bySetNum = new Map<string, ScryfallCard>();
	const byNameSet = new Map<string, ScryfallCard>();
	const byName = new Map<string, ScryfallCard>();
	for (const sc of scryfallCards) {
		// Index under the lang-qualified key so a same-set/num card in another language
		// does not overwrite the English print (and vice versa).
		bySetNum.set(
			buildIdentifierKey({
				set: sc.set,
				collector_number: sc.collector_number,
				...(sc.lang && sc.lang !== 'en' ? { lang: sc.lang } : {}),
			}),
			sc
		);
		// Also index English prints under the bare (no-lang) key so the lang-agnostic
		// fallback in resolveCard can find them without colliding across languages.
		if (!sc.lang || sc.lang === 'en') {
			const bareKey = buildIdentifierKey({
				set: sc.set,
				collector_number: sc.collector_number,
			});
			if (!bySetNum.has(bareKey)) bySetNum.set(bareKey, sc);
		}
		const nameSetKey = `name:${sc.name.toLowerCase()}/set:${sc.set.toLowerCase()}`;
		const existingNameSet = byNameSet.get(nameSetKey);
		byNameSet.set(nameSetKey, existingNameSet ? preferPrint(existingNameSet, sc) : sc);

		const nameKey = `name:${sc.name.toLowerCase()}`;
		const existingName = byName.get(nameKey);
		byName.set(nameKey, existingName ? preferPrint(existingName, sc) : sc);
	}
	return { bySetNum, byNameSet, byName };
}

function resolveCard(pc: PendingCard, lookup: ScryfallLookup): ScryfallCard | undefined {
	const key = buildIdentifierKey(buildPendingIdentifier(pc));
	// Also try without lang — Scryfall falls back to English when the requested lang doesn't exist
	const keyNoLang =
		pc.set && pc.collectorNumber
			? buildIdentifierKey({ set: pc.set, collector_number: pc.collectorNumber })
			: null;
	return (
		lookup.bySetNum.get(key) ??
		(keyNoLang ? lookup.bySetNum.get(keyNoLang) : undefined) ??
		lookup.byNameSet.get(`name:${pc.name.toLowerCase()}/set:${pc.set.toLowerCase()}`) ??
		lookup.byName.get(`name:${pc.name.toLowerCase()}`)
	);
}

function logNotFound(
	notFound: ScryfallCardIdentifier[],
	batchIndex: number,
	totalBatches: number
): void {
	if (notFound.length === 0) return;
	const lines = notFound.map((id) => {
		if (id.set && id.collector_number) {
			const langSuffix = id.lang ? ' lang=' + id.lang : '';
			return '  • set=' + id.set + ' num=' + id.collector_number + langSuffix;
		}
		if (id.name && id.set) return `  • name="${id.name}" set=${id.set}`;
		if (id.name) return `  • name="${id.name}"`;
		return `  • ${JSON.stringify(id)}`;
	});
	console.warn(
		`[Import preview] batch ${batchIndex + 1}/${totalBatches}: ${notFound.length} not found:\n${lines.join('\n')}`
	);
}

export function useImportPreviewFetch(deps: {
	setResolved: (r: ResolvedImportResult | null) => void;
	setIsLoadingPreview: (b: boolean) => void;
	setPreviewProgress: (p: ImportProgress) => void;
	normalizePending: (cards: PendingCard[]) => PendingCard[];
}) {
	const { setResolved, setIsLoadingPreview, setPreviewProgress, normalizePending } = deps;
	const abortRef = useRef(false);

	const cancelPreviewFetch = useCallback(() => {
		abortRef.current = true;
	}, []);

	const fetchPreviewCards = useCallback(
		async (parsed: ParsedImportResult) => {
			if (parsed.cards.length === 0) return;

			const normalized = normalizePending(parsed.cards);
			const identifiers = buildFetchIdentifiers(normalized);

			const chunks: (typeof identifiers)[] = [];
			for (let i = 0; i < identifiers.length; i += BATCH_SIZE) {
				chunks.push(identifiers.slice(i, i + BATCH_SIZE));
			}

			abortRef.current = false;
			setIsLoadingPreview(true);
			setPreviewProgress({ current: 0, total: chunks.length });
			setResolved(null);

			const scryfallCards: ScryfallCard[] = [];

			try {
				for (let i = 0; i < chunks.length; i++) {
					if (abortRef.current) break;
					try {
						const listResult = await getCardCollection(chunks[i]);
						logNotFound(listResult.not_found ?? [], i, chunks.length);
						scryfallCards.push(...listResult.data);
					} catch (err) {
						// A failed batch (network/CORS/timeout) must not abort the whole import:
						// its cards simply stay unresolved and surface in the "not found" table.
						console.error(
							`[Import preview] batch ${i + 1}/${chunks.length} failed:`,
							err instanceof Error ? err.message : err
						);
					}
					setPreviewProgress({ current: i + 1, total: chunks.length });
				}

				if (abortRef.current) return;

				const lookup = buildLookup(scryfallCards);
				const resolved: Card[] = [];
				const notFound: PendingCard[] = [];

				for (const pc of normalized) {
					const sc = resolveCard(pc, lookup);
					if (sc) {
						resolved.push({
							...sc,
							entry: {
								rowId: sc.id, // provisional: overwritten with randomUUID() at confirmation
								dateAdded: '',
								isFoil: pc.isFoil,
								foilType: pc.foilType,
								condition: pc.condition,
								language: pc.language,
								purchasePrice: pc.purchasePrice,
								forTrade: pc.forTrade,
								alter: pc.alter,
								proxy: pc.proxy,
								tags: pc.tags,
							} satisfies CardEntry,
						});
					} else {
						notFound.push(pc);
					}
				}

				setResolved({ resolved, notFound });
			} finally {
				setIsLoadingPreview(false);
			}
		},
		[setResolved, setIsLoadingPreview, setPreviewProgress, normalizePending]
	);

	return { fetchPreviewCards, cancelPreviewFetch };
}
