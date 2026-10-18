'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { CardCopy } from '@/types/cards';
import type { PdfSettings } from '@/components/PdfSettingsModal/PdfSettingsModal';
import type { LoadCardCopiesResult } from '@/lib/collection-index/load-card-copies';
import { generateCardsPdf } from '@/lib/pdf/generateCardsPdf';
import { resolveLocalizedImageUris } from '@/lib/scryfall/utils/resolveLocalizedImageUri';
import { usePreferredCardLang } from '@/lib/scryfall/hooks/useLocalizedImage';

/**
 * Owns the wishlist "Generate PDF" flow: the open/generating state, the flat
 * list of cards (one per copy), and the async image-resolve → render pipeline.
 * The `<PdfSettingsModal>` stays rendered in the page, driven by this state.
 */
export function useWishlistPdf(loadCards: () => Promise<LoadCardCopiesResult>) {
	const t = useTranslations('collection');
	const [isModalOpen, setModalOpen] = useState(false);
	const [isGenerating, setGenerating] = useState(false);
	const [isPreparing, setPreparing] = useState(false);
	const [pdfCards, setPdfCards] = useState<CardCopy[]>([]);
	const preferredLang = usePreferredCardLang();

	// One card per wishlist copy; every copy must be resolved before the modal opens.
	const openModal = useCallback(() => {
		setPreparing(true);
		void loadCards()
			.then(({ copies, missing }) => {
				if (missing > 0 && !window.confirm(t('exportPartialConfirm', { missing }))) return;
				setPdfCards(copies);
				setModalOpen(true);
			})
			.catch((err) => {
				console.error('[useWishlistPdf] loading cards failed:', err);
				window.alert(t('exportFailed'));
			})
			.finally(() => setPreparing(false));
	}, [loadCards, t]);

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
