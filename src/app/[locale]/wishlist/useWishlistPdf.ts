'use client';

import { useCallback, useState } from 'react';
import type { CardCopy } from '@/types/cards';
import type { PdfSettings } from '@/components/PdfSettingsModal/PdfSettingsModal';
import { generateCardsPdf } from '@/lib/pdf/generateCardsPdf';
import { resolveLocalizedImageUris } from '@/lib/scryfall/utils/resolveLocalizedImageUri';
import { usePreferredCardLang } from '@/lib/scryfall/hooks/useLocalizedImage';

/**
 * Owns the wishlist "Generate PDF" flow: the open/generating state, the flat
 * list of cards (one per copy), and the async image-resolve → render pipeline.
 * The `<PdfSettingsModal>` stays rendered in the page, driven by this state.
 */
export function useWishlistPdf(loadCards: () => Promise<CardCopy[]>) {
	const [isModalOpen, setModalOpen] = useState(false);
	const [isGenerating, setGenerating] = useState(false);
	const [isPreparing, setPreparing] = useState(false);
	const [pdfCards, setPdfCards] = useState<CardCopy[]>([]);
	const preferredLang = usePreferredCardLang();

	// One card per wishlist copy; every copy must be resolved before the modal opens.
	const openModal = useCallback(() => {
		setPreparing(true);
		void loadCards()
			.then((cards) => {
				setPdfCards(cards);
				setModalOpen(true);
			})
			.catch((err) => console.error('[useWishlistPdf] loading cards failed:', err))
			.finally(() => setPreparing(false));
	}, [loadCards]);

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
		isPreparing,
		openModal,
		closeModal: useCallback(() => setModalOpen(false), []),
		isGenerating,
		generate,
	};
}
