'use client';

import { useState, useEffect } from 'react';
import { LANGUAGE_TO_SCRYFALL_CODE } from '@/lib/mtg/languages';
import { getCardBySetNumberAndLang } from '@/lib/scryfall/endpoints/cards';
import {
	getLocalizedImageFromCache,
	putLocalizedImageInCache,
} from '@/lib/scryfall/utils/card-cache';
import type { MtgLanguage } from '@/lib/mtg/languages';
import type { ScryfallImageUris, ScryfallCardFace } from '@/lib/scryfall/types/scryfall';

interface LocalizedImageResult {
	image_uris?: ScryfallImageUris;
	card_faces?: ScryfallCardFace[];
}

// Module-level negative cache: keys that returned 404 — never re-fetch these
const notFound = new Set<string>();

export function useLocalizedImage(
	card: { set: string; collector_number: string; language?: string; entry?: { language?: string } },
	enabled: boolean
): LocalizedImageResult | null {
	const [result, setResult] = useState<LocalizedImageResult | null>(null);

	const language = card.entry?.language ?? card.language;
	const lang = language ? LANGUAGE_TO_SCRYFALL_CODE[language as MtgLanguage] : undefined;
	const cacheKey = `${card.set}/${card.collector_number}/${lang}`;
	const needsFetch = enabled && !!lang && lang !== 'en' && !notFound.has(cacheKey);

	useEffect(() => {
		if (!needsFetch) return;
		let cancelled = false;

		(async () => {
			// 1. Check IndexedDB cache
			const cached = await getLocalizedImageFromCache(cacheKey);
			if (cancelled) return;
			if (cached) {
				setResult({
					image_uris: cached.image_uris,
					card_faces: cached.face_image_uris
						? cached.face_image_uris.map((uris) => ({
								object: 'card_face' as const,
								mana_cost: '',
								name: '',
								image_uris: uris,
							}))
						: undefined,
				});
				return;
			}

			// 2. Fetch from Scryfall API
			try {
				const localized = await getCardBySetNumberAndLang(card.set, card.collector_number, lang!);
				if (cancelled) return;

				const imageResult: LocalizedImageResult = {
					image_uris: localized.image_uris,
					card_faces: localized.card_faces,
				};
				setResult(imageResult);

				// 3. Persist to IndexedDB
				void putLocalizedImageInCache({
					key: cacheKey,
					image_uris: localized.image_uris,
					face_image_uris: localized.card_faces?.map((f) => f.image_uris),
					cachedAt: Date.now(),
				});
			} catch {
				notFound.add(cacheKey);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [card.set, card.collector_number, lang, needsFetch, cacheKey]);

	return result;
}
