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

// A localized result is only valid for the card whose cacheKey it was fetched
// for. Selecting it by tag prevents a stale image from a previous print/edition
// being merged onto a new card. Exported for unit testing.
export function selectLocalized<T>(
	needsFetch: boolean,
	currentKey: string,
	result: { key: string; data: T } | null
): T | null {
	if (!needsFetch || result?.key !== currentKey) return null;
	return result.data;
}

export function useLocalizedImage(
	card: {
		set?: string;
		collector_number?: string;
		language?: string;
		entry?: { language?: string };
	},
	enabled: boolean
): UseLocalizedImageResult {
	// `result` is tagged with the cacheKey it belongs to. Exposing it only when
	// the tag matches the current card means a stale localized image from a
	// previous print/edition is never merged onto a new card (which would freeze
	// the preview) — without resetting state from inside the effect.
	const [result, setResult] = useState<{ key: string; data: LocalizedImageResult } | null>(null);
	const [loadingKey, setLoadingKey] = useState<string | null>(null);

	const language = card.entry?.language ?? card.language;
	const lang = language ? LANGUAGE_TO_SCRYFALL_CODE[language as MtgLanguage] : undefined;
	const cacheKey = `${card.set}/${card.collector_number}/${lang}`;
	const needsFetch =
		enabled &&
		!!lang &&
		lang !== 'en' &&
		!!card.set &&
		!!card.collector_number &&
		!notFound.has(cacheKey);

	useEffect(() => {
		if (!needsFetch) return;
		const controller = new AbortController();

		(async () => {
			setLoadingKey(cacheKey);
			// 1. Check IndexedDB cache
			const cached = await getLocalizedImageFromCache(cacheKey);
			if (controller.signal.aborted) return;
			if (cached) {
				setResult({
					key: cacheKey,
					data: {
						image_uris: cached.image_uris,
						card_faces: cached.face_image_uris
							? cached.face_image_uris.map((uris) => ({
									object: 'card_face' as const,
									mana_cost: '',
									name: '',
									image_uris: uris,
								}))
							: undefined,
					},
				});
				setLoadingKey(null);
				return;
			}

			// 2. Fetch from Scryfall API
			try {
				const localized = await getCardBySetNumberAndLang(
					card.set!,
					card.collector_number!,
					lang!,
					controller.signal
				);
				if (controller.signal.aborted) return;

				setResult({
					key: cacheKey,
					data: { image_uris: localized.image_uris, card_faces: localized.card_faces },
				});
				setLoadingKey(null);

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
				setLoadingKey(null);
			}
		})();

		return () => {
			controller.abort();
		};
	}, [card.set, card.collector_number, lang, needsFetch, cacheKey]);

	// Only surface a localized image / loading state that belongs to the current
	// card. A result tagged with a previous cacheKey is treated as absent.
	return {
		localized: selectLocalized(needsFetch, cacheKey, result),
		loading: needsFetch && loadingKey === cacheKey,
	};
}
