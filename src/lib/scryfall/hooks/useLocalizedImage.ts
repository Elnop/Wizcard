'use client';

import { useState, useEffect } from 'react';
import { LANGUAGE_TO_SCRYFALL_CODE } from '@/lib/mtg/languages';
import { getCardBySetNumberAndLang } from '@/lib/scryfall/endpoints/cards';
import {
	getLocalizedImageFromCache,
	putLocalizedImageInCache,
} from '@/lib/scryfall/utils/card-cache';
import { useProfileStore } from '@/lib/profile/store/profile-store';
import type { MtgLanguage } from '@/lib/mtg/languages';
import type { ScryfallImageUris, ScryfallCardFace } from '@/lib/scryfall/types/scryfall';

export interface LocalizedImageResult {
	image_uris?: ScryfallImageUris;
	card_faces?: ScryfallCardFace[];
}

export interface LocalizedImageCard {
	set?: string;
	collector_number?: string;
	language?: string;
	entry?: { language?: string };
}

// Module-level negative cache: keys that returned 404 — never re-fetch these.
// Shared by the hook and the non-hook resolver so a 404 is remembered once.
const notFound = new Set<string>();

/**
 * Scryfall language code to display a card in, or undefined when no localized
 * print should be fetched.
 *
 * A card with no recorded language falls back to the user's preferred language
 * (settings). That print may not exist — Scryfall then 404s and the caller keeps
 * the card's default (English) image, which is the intended fallback.
 */
function langCodeFor(card: LocalizedImageCard, preferredLang?: string): string | undefined {
	const language = card.entry?.language ?? card.language;
	if (!language) return preferredLang;
	return LANGUAGE_TO_SCRYFALL_CODE[language as MtgLanguage];
}

/** Cache key for a localized image: "set/collector_number/lang". */
function cacheKeyFor(card: LocalizedImageCard, lang: string): string {
	return `${card.set}/${card.collector_number}/${lang}`;
}

/** Whether this card needs a non-English localized image fetched at all. */
function needsLocalization(card: LocalizedImageCard, lang: string | undefined): lang is string {
	return !!lang && lang !== 'en' && !!card.set && !!card.collector_number;
}

function cachedToResult(cached: {
	image_uris?: ScryfallImageUris;
	face_image_uris?: (ScryfallImageUris | undefined)[];
}): LocalizedImageResult {
	return {
		image_uris: cached.image_uris,
		card_faces: cached.face_image_uris
			? cached.face_image_uris.map((uris) => ({
					object: 'card_face' as const,
					mana_cost: '',
					name: '',
					image_uris: uris,
				}))
			: undefined,
	};
}

/**
 * Single source of truth for resolving a card's localized image: shared
 * negative cache → IndexedDB cache → Scryfall fetch (through the shared
 * throttle, which serializes requests and absorbs 429s). Returns null when the
 * card needs no localization, the lookup is aborted, or the print 404s.
 *
 * Both useLocalizedImage (display) and resolveLocalizedImageUri (PDF export)
 * call this so the cache, throttle, and 404 handling are never duplicated.
 */
export async function fetchLocalizedImage(
	card: LocalizedImageCard,
	signal?: AbortSignal,
	preferredLang?: string
): Promise<LocalizedImageResult | null> {
	const lang = langCodeFor(card, preferredLang);
	if (!needsLocalization(card, lang)) return null;

	const cacheKey = cacheKeyFor(card, lang);
	if (notFound.has(cacheKey)) return null;

	// 1. IndexedDB cache
	const cached = await getLocalizedImageFromCache(cacheKey);
	if (signal?.aborted) return null;
	if (cached) return cachedToResult(cached);

	// 2. Fetch from Scryfall (rate-limited by the shared throttle)
	try {
		const localized = await getCardBySetNumberAndLang(
			card.set!,
			card.collector_number!,
			lang,
			signal
		);
		if (signal?.aborted) return null;

		// 3. Persist to IndexedDB
		void putLocalizedImageInCache({
			key: cacheKey,
			image_uris: localized.image_uris,
			face_image_uris: localized.card_faces?.map((f) => f.image_uris),
			cachedAt: Date.now(),
		});

		return { image_uris: localized.image_uris, card_faces: localized.card_faces };
	} catch (e) {
		// Aborted requests (card left viewport, component unmounted) are not errors —
		// don't blacklist the cache key so the image can be retried next time.
		if (e instanceof DOMException && e.name === 'AbortError') return null;
		notFound.add(cacheKey);
		return null;
	}
}

/**
 * The language cards should be displayed in when they carry none of their own:
 * the user's settings language (`Profile.language` is already a Scryfall code).
 *
 * Reads the store rather than useProfileContext, which throws outside
 * ProfileProvider — this hook also runs in views rendered without it. A missing
 * profile (logged out, still hydrating) yields undefined: no localized fetch,
 * so the card keeps its default English image.
 */
export function usePreferredCardLang(): string | undefined {
	return useProfileStore((s) => s.profile?.language);
}

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
	card: LocalizedImageCard,
	enabled: boolean
): UseLocalizedImageResult {
	// `result` is tagged with the cacheKey it belongs to. Exposing it only when
	// the tag matches the current card means a stale localized image from a
	// previous print/edition is never merged onto a new card (which would freeze
	// the preview) — without resetting state from inside the effect.
	const [result, setResult] = useState<{ key: string; data: LocalizedImageResult } | null>(null);
	const [loadingKey, setLoadingKey] = useState<string | null>(null);

	// Read the store directly rather than useProfileContext: this hook also runs
	// in views rendered outside ProfileProvider, where the context would throw.
	const preferredLang = usePreferredCardLang();

	const lang = langCodeFor(card, preferredLang);
	const cacheKey = lang ? cacheKeyFor(card, lang) : '';
	const needsFetch = enabled && needsLocalization(card, lang);

	useEffect(() => {
		if (!needsFetch) return;
		const controller = new AbortController();

		(async () => {
			setLoadingKey(cacheKey);
			// Shared cache→fetch logic, also used by the PDF export resolver.
			const localized = await fetchLocalizedImage(card, controller.signal, preferredLang);
			if (controller.signal.aborted) return;
			// Tag the result with its cacheKey so a stale image from a previous
			// print/edition is never surfaced for a different card.
			setResult(localized ? { key: cacheKey, data: localized } : null);
			setLoadingKey(null);
		})();

		return () => {
			controller.abort();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- card identity is captured via its set/number/lang (cacheKey)
	}, [card.set, card.collector_number, lang, needsFetch, cacheKey, preferredLang]);

	// Only surface a localized image / loading state that belongs to the current
	// card. A result tagged with a previous cacheKey is treated as absent.
	return {
		localized: selectLocalized(needsFetch, cacheKey, result),
		loading: needsFetch && loadingKey === cacheKey,
	};
}
