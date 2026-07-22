'use client';

import { useMemo, useState, type ReactNode } from 'react';
import type { DeckZone } from '@/types/decks';
import type { ResolvedDeckCard } from './useDeckDetail';
import type { DeckPdfExportOptions } from '@/lib/pdf/types';
import { filterCardsForPdf } from '@/lib/pdf/filterCardsForPdf';
import { generateCardsPdf } from '@/lib/pdf/generateCardsPdf';
import { resolveLocalizedImageUris } from '@/lib/scryfall/utils/resolveLocalizedImageUri';
import { usePreferredCardLang } from '@/lib/scryfall/hooks/useLocalizedImage';
import { useAnalytics } from '@/lib/analytics/context/AnalyticsContext';
import { DeckPdfExportModal } from './components/DeckPdfExportModal/DeckPdfExportModal';
import { PdfSettingsModal } from '@/components/PdfSettingsModal/PdfSettingsModal';

type Args = {
	resolvedCards: ResolvedDeckCard[];
	cardsByZone: Record<DeckZone, ResolvedDeckCard[]>;
	/** Base zones (without tokens); the hook appends `tokens` when the deck has any. */
	zones: DeckZone[];
	deckName: string;
	deckId: string;
};

/**
 * Two-step deck → PDF export flow (zone/print selection → layout settings →
 * generate & download), shared by the owner and read-only deck views. Both hooks
 * (`usePreferredCardLang`, `useAnalytics`) tolerate rendering outside their
 * providers, so this works for anonymous visitors too.
 *
 * Returns a trigger to open the flow and the modal tree to render — the caller
 * wires `openPdfExport` into `DeckHeader`'s `onGeneratePdf` and drops `pdfModals`
 * into its JSX.
 */
export function useDeckPdfExport({ resolvedCards, cardsByZone, zones, deckName, deckId }: Args): {
	openPdfExport: () => void;
	pdfModals: ReactNode;
} {
	const preferredLang = usePreferredCardLang();
	const analytics = useAnalytics();

	const [pdfExportModalOpen, setPdfExportModalOpen] = useState(false);
	const [pdfSettingsModalOpen, setPdfSettingsModalOpen] = useState(false);
	const [pdfExportOptions, setPdfExportOptions] = useState<DeckPdfExportOptions | null>(null);
	const [pdfGenerating, setPdfGenerating] = useState(false);

	const pdfZones = useMemo<DeckZone[]>(
		() => (cardsByZone.tokens.length > 0 ? [...zones, 'tokens'] : zones),
		[zones, cardsByZone.tokens]
	);

	const pdfFilteredCards = useMemo(
		() => (pdfExportOptions ? filterCardsForPdf(resolvedCards, pdfExportOptions) : []),
		[resolvedCards, pdfExportOptions]
	);

	const pdfModals = (
		<>
			{pdfExportModalOpen && (
				<DeckPdfExportModal
					availableZones={pdfZones}
					cards={resolvedCards}
					onConfirm={(options) => {
						setPdfExportOptions(options);
						setPdfExportModalOpen(false);
						setPdfSettingsModalOpen(true);
					}}
					onClose={() => setPdfExportModalOpen(false)}
				/>
			)}

			{pdfSettingsModalOpen && pdfExportOptions && (
				<PdfSettingsModal
					cards={pdfFilteredCards}
					generating={pdfGenerating}
					onConfirm={(settings) => {
						void (async () => {
							setPdfGenerating(true);
							try {
								// Resolve localized images (cache hit → instant; miss → fetched
								// via the shared Scryfall throttle, serialized and 429-safe).
								const resolved = await Promise.all(
									pdfFilteredCards.map((c) => resolveLocalizedImageUris(c, 'normal', preferredLang))
								);
								const imageUrls = resolved.flat().filter((url): url is string => !!url);
								await generateCardsPdf(imageUrls, settings, `${deckName}.pdf`);
								analytics.track({ name: 'deck_exported', props: { deckId, format: 'pdf' } });
								setPdfSettingsModalOpen(false);
							} finally {
								setPdfGenerating(false);
							}
						})();
					}}
					onClose={() => setPdfSettingsModalOpen(false)}
				/>
			)}
		</>
	);

	return { openPdfExport: () => setPdfExportModalOpen(true), pdfModals };
}
