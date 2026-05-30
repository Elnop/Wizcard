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

interface UseLocalizedImageResult {
	localized: LocalizedImageResult | null;
	loading: boolean;
}

export function useLocalizedImage(
	card: { set: string; collector_number: string; language?: string; entry?: { language?: string } },
	enabled: boolean
): UseLocalizedImageResult {
	const [result, setResult] = useState<LocalizedImageResult | null>(null);
	const [loading, setLoading] = useState(false);

	const language = card.entry?.language ?? card.language;
	const lang = language ? LANGUAGE_TO_SCRYFALL_CODE[language as MtgLanguage] : undefined;
	const cacheKey = `${card.set}/${card.collector_number}/${lang}`;
	const needsFetch = enabled && !!lang && lang !== 'en' && !notFound.has(cacheKey);

	useEffect(() => {
		if (!needsFetch) return;
		const controller = new AbortController();

		(async () => {
			setLoading(true);
			// 1. Check IndexedDB cache
			const cached = await getLocalizedImageFromCache(cacheKey);
			if (controller.signal.aborted) return;
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
				setLoading(false);
				return;
			}

			// 2. Fetch from Scryfall API
			try {
				const localized = await getCardBySetNumberAndLang(
					card.set,
					card.collector_number,
					lang!,
					controller.signal
				);
				if (controller.signal.aborted) return;

				const imageResult: LocalizedImageResult = {
					image_uris: localized.image_uris,
					card_faces: localized.card_faces,
				};
				setResult(imageResult);
				setLoading(false);

				// 3. Persist to IndexedDB
				void putLocalizedImageInCache({
					key: cacheKey,
					image_uris: localized.image_uris,
					face_image_uris: localized.card_faces?.map((f) => f.image_uris),
					cachedAt: Date.now(),
				});
			} catch (e) {
				// Aborted requests (card left viewport, component unmounted) are not errors —
				// don't blacklist the cache key so the image can be retried next time.
				if (e instanceof DOMException && e.name === 'AbortError') return;
				notFound.add(cacheKey);
				setLoading(false);
			}
		})();

		return () => {
			controller.abort();
		};
	}, [card.set, card.collector_number, lang, needsFetch, cacheKey]);

	return { localized: result, loading };
}
