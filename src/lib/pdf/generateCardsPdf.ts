import { jsPDF } from 'jspdf';
import type { PdfSettings } from '@/components/PdfSettingsModal/PdfSettingsModal';

// Standard MTG card dimensions in mm
const CARD_W_MM = 63;
const CARD_H_MM = 88;
// A4 in mm
const PAGE_W_MM = 210;
const PAGE_H_MM = 297;

async function loadImageAsBase64(url: string): Promise<string> {
	// Scryfall (via Cloudflare) only attaches the CORS header to a network
	// response. When the same image was already loaded by the app as a plain
	// <img>/next/image (no crossOrigin), the browser cached it as an *opaque*
	// response with no exposed CORS header; a later cors-mode fetch would reuse
	// that entry and get blocked. `cache: 'reload'` forces a fresh network
	// request so the CORS header is present and the fetch succeeds.
	const res = await fetch(url, { mode: 'cors', cache: 'reload' });
	if (!res.ok) {
		throw new Error(`HTTP ${res.status} for ${url}`);
	}
	const blob = await res.blob();
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(new Error(`Failed to load image: ${url}`));
		reader.readAsDataURL(blob);
	});
}

function computeLayout(settings: PdfSettings) {
	const innerW = PAGE_W_MM - settings.margin * 2;
	const innerH = PAGE_H_MM - settings.margin * 2;
	const cardW = CARD_W_MM * settings.cardScale;
	const cardH = CARD_H_MM * settings.cardScale;
	const cols = Math.max(1, Math.floor((innerW + settings.cardGap) / (cardW + settings.cardGap)));
	const rows = Math.max(1, Math.floor((innerH + settings.cardGap) / (cardH + settings.cardGap)));
	return { cols, rows, cardsPerPage: cols * rows, cardW, cardH };
}

export async function generateCardsPdf(
	imageUrls: string[],
	settings: PdfSettings,
	filename = 'cards.pdf'
): Promise<void> {
	const layout = computeLayout(settings);

	const imageResults = await Promise.allSettled(imageUrls.map(loadImageAsBase64));

	const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

	let index = 0;
	let firstPage = true;

	while (index < imageUrls.length) {
		if (!firstPage) pdf.addPage('a4', 'portrait');
		firstPage = false;

		let slot = 0;
		while (slot < layout.cardsPerPage && index < imageUrls.length) {
			const col = slot % layout.cols;
			const row = Math.floor(slot / layout.cols);

			const x = settings.margin + col * (layout.cardW + settings.cardGap);
			const y = settings.margin + row * (layout.cardH + settings.cardGap);

			const result = imageResults[index];

			if (result.status === 'fulfilled') {
				pdf.addImage({
					imageData: result.value,
					x,
					y,
					width: layout.cardW,
					height: layout.cardH,
					compression: 'FAST',
				});
			} else {
				pdf.setFillColor(200, 200, 200);
				pdf.rect(x, y, layout.cardW, layout.cardH, 'F');
			}

			if (settings.cutLines) {
				pdf.setDrawColor(180, 180, 180);
				pdf.setLineWidth(0.1);
				pdf.rect(x, y, layout.cardW, layout.cardH, 'S');
			}

			slot++;
			index++;
		}
	}

	await pdf.save(filename, { returnPromise: true });
}
