'use client';

import { useCallback, useMemo, useState } from 'react';
import type { CardStack } from '@/types/cards';
import type { PdfSettings } from '@/components/PdfSettingsModal/PdfSettingsModal';
import { generateCardsPdf } from '@/lib/pdf/generateCardsPdf';
import { resolveLocalizedImageUris } from '@/lib/scryfall/utils/resolveLocalizedImageUri';
import { usePreferredCardLang } from '@/lib/scryfall/hooks/useLocalizedImage';

/**
 * Owns the wishlist "Generate PDF" flow: the open/generating state, the flat
 * list of cards (one per copy), and the async image-resolve → render pipeline.
 * The `<PdfSettingsModal>` stays rendered in the page, driven by this state.
 */
export function useWishlistPdf(stacks: CardStack[]) {
	const [isModalOpen, setModalOpen] = useState(false);
	const [isGenerating, setGenerating] = useState(false);
	const preferredLang = usePreferredCardLang();

	// One card per wishlist copy (e.g. 3x Sol Ring → 3 cards in the PDF).
	const pdfCards = useMemo(() => stacks.flatMap((stack) => stack.cards), [stacks]);

	const generate = useCallback(
		(settings: PdfSettings) => {
			void (async () => {
				setGenerating(true);
				try {
					// Resolve localized images (cache hit → instant; miss → fetched
					// via the shared Scryfall throttle, serialized and 429-safe).
					const resolved = await Promise.all(
						pdfCards.map((c) => resolveLocalizedImageUris(c, 'normal', preferredLang))
					);
					const imageUrls = resolved.flat().filter((url): url is string => !!url);
					await generateCardsPdf(imageUrls, settings, 'wishlist.pdf');
					setModalOpen(false);
				} finally {
					setGenerating(false);
				}
			})();
		},
		[pdfCards, preferredLang]
	);

	return {
		pdfCards,
		isModalOpen,
		openModal: useCallback(() => setModalOpen(true), []),
		closeModal: useCallback(() => setModalOpen(false), []),
		isGenerating,
		generate,
	};
}
