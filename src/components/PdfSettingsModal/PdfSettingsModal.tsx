'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { Modal } from '@/components/Modal/Modal';
import { Button } from '@/components/Button/Button';
import { CardList } from '@/lib/card/components/CardList/CardList';
import { useCardFaceImageUris } from '@/lib/scryfall/hooks/useCardImageUri';
import { isScryfallImageUrl, scryfallImageLoader } from '@/lib/scryfall/utils/scryfallImageLoader';
import type { Card } from '@/types/cards';
import styles from './PdfSettingsModal.module.css';

export type PdfSettings = {
	margin: number;
	cardGap: number;
	cutLines: boolean;
	cardScale: number;
};

const DEFAULTS: PdfSettings = {
	margin: 8.5,
	cardGap: 1,
	cutLines: true,
	cardScale: 1.0,
};

// Standard MTG card: 63mm × 88mm
const CARD_W_MM = 63;
const CARD_H_MM = 88;
// A4: 210mm × 297mm
const PAGE_W_MM = 210;
const PAGE_H_MM = 297;

type Props = {
	cards: Card[];
	initial?: Partial<PdfSettings>;
	generating?: boolean;
	onConfirm: (settings: PdfSettings) => void;
	onClose: () => void;
};

// A single printed slot = one card face. Double-faced cards produce two slots
// (faceIndex 0 = front, 1 = back), matching what generateCardsPdf renders.
type FaceSlot = { card: Card; faceIndex: number };

// Deploy each card into its printed face slots, mirroring the PDF export:
// getScryfallCardFaceImageUris yields [front, back] for DFCs and a single entry
// otherwise. The face count is structural (card.card_faces), so it's known
// synchronously without waiting for the localized image fetch.
function toFaceSlots(cards: Card[]): FaceSlot[] {
	return cards.flatMap((card) => {
		const faces = card.card_faces;
		const hasTwoFaces = !!(faces?.[0]?.image_uris?.normal && faces?.[1]?.image_uris?.normal);
		return hasTwoFaces
			? [
					{ card, faceIndex: 0 },
					{ card, faceIndex: 1 },
				]
			: [{ card, faceIndex: 0 }];
	});
}

function PreviewCardImage({
	slot,
	cardWPx,
	cardHPx,
	col,
	row,
	gapPx,
	cutLines,
}: {
	slot: FaceSlot;
	cardWPx: number;
	cardHPx: number;
	col: number;
	row: number;
	gapPx: number;
	cutLines: boolean;
}) {
	const { uris, loading } = useCardFaceImageUris(slot.card, 'normal', true);
	const url = uris[slot.faceIndex] ?? uris[0];
	return (
		<div
			className={`${styles.previewCard} ${cutLines ? styles.previewCardCutLines : ''}`}
			style={{
				width: cardWPx,
				height: cardHPx,
				left: col * (cardWPx + gapPx),
				top: row * (cardHPx + gapPx),
			}}
		>
			{!loading && url && (
				<Image
					src={url}
					loader={scryfallImageLoader}
					unoptimized={isScryfallImageUrl(url)}
					alt={slot.card.name}
					fill
					sizes={`${Math.round(cardWPx)}px`}
					style={{ objectFit: 'cover', borderRadius: 2 }}
				/>
			)}
		</div>
	);
}

function computeLayout(settings: PdfSettings) {
	const inner = PAGE_W_MM - settings.margin * 2;
	const innerH = PAGE_H_MM - settings.margin * 2;
	const cardW = CARD_W_MM * settings.cardScale;
	const cardH = CARD_H_MM * settings.cardScale;
	const cols = Math.max(1, Math.floor((inner + settings.cardGap) / (cardW + settings.cardGap)));
	const rows = Math.max(1, Math.floor((innerH + settings.cardGap) / (cardH + settings.cardGap)));
	return { cols, rows, cardsPerPage: cols * rows, cardW, cardH };
}

export function PdfSettingsModal({
	cards,
	initial,
	generating = false,
	onConfirm,
	onClose,
}: Props) {
	const [settings, setSettings] = useState<PdfSettings>({ ...DEFAULTS, ...initial });

	const set = <K extends keyof PdfSettings>(key: K, value: PdfSettings[K]) =>
		setSettings((prev) => ({ ...prev, [key]: value }));

	const handleNumber = (key: keyof PdfSettings, raw: string, min = 0) => {
		const n = parseFloat(raw);
		if (!isNaN(n) && n >= min) set(key, n);
	};

	const layout = useMemo(() => computeLayout(settings), [settings]);

	// Deploy DFCs into per-face slots so the preview pagination/positions match
	// the generated PDF exactly (each face occupies its own slot).
	const faceSlots = useMemo(() => toFaceSlots(cards), [cards]);

	const PREVIEW_PX = 220;
	const scale = PREVIEW_PX / PAGE_W_MM;
	const cardWPx = layout.cardW * scale;
	const cardHPx = layout.cardH * scale;
	const marginPx = settings.margin * scale;
	const gapPx = settings.cardGap * scale;

	const totalPages =
		layout.cardsPerPage > 0 ? Math.ceil(faceSlots.length / layout.cardsPerPage) : 1;
	const pages = Array.from({ length: totalPages }, (_, p) =>
		faceSlots.slice(p * layout.cardsPerPage, (p + 1) * layout.cardsPerPage)
	);

	return (
		<Modal onClose={generating ? () => {} : onClose} className={styles.dialog} zIndex={1200}>
			<h2 className={styles.title}>PDF settings</h2>

			<div className={styles.body}>
				<div className={styles.topRow}>
					{/* ── Settings panel ── */}
					<div className={styles.settingsPanel}>
						<div className={styles.fields}>
							<label className={styles.field}>
								<span className={styles.fieldLabel}>Marge (mm)</span>
								<input
									type="number"
									className={styles.numberInput}
									min={0}
									max={50}
									step={0.5}
									value={settings.margin}
									onChange={(e) => handleNumber('margin', e.target.value)}
								/>
							</label>

							<label className={styles.field}>
								<span className={styles.fieldLabel}>Gap cartes (mm)</span>
								<input
									type="number"
									className={styles.numberInput}
									min={0}
									max={20}
									step={0.5}
									value={settings.cardGap}
									onChange={(e) => handleNumber('cardGap', e.target.value)}
								/>
							</label>

							<label className={styles.field}>
								<span className={styles.fieldLabel}>Taille cartes</span>
								<div className={styles.scaleRow}>
									<input
										type="range"
										className={styles.slider}
										min={0.5}
										max={1.5}
										step={0.05}
										value={settings.cardScale}
										onChange={(e) => set('cardScale', parseFloat(e.target.value))}
									/>
									<span className={styles.scaleValue}>{Math.round(settings.cardScale * 100)}%</span>
								</div>
							</label>

							<label className={styles.fieldCheckbox}>
								<input
									type="checkbox"
									checked={settings.cutLines}
									onChange={(e) => set('cutLines', e.target.checked)}
								/>
								Traits de coupe
							</label>
						</div>

						<p className={styles.layoutInfo}>
							{layout.cols} × {layout.rows} cartes/page · {totalPages} page
							{totalPages !== 1 ? 's' : ''}
						</p>
					</div>

					{/* ── PDF pages preview ── */}
					<div className={styles.pdfPreviewPanel}>
						<p className={styles.sectionTitle}>
							{totalPages} page{totalPages !== 1 ? 's' : ''}
						</p>
						<div className={styles.pdfPagesScroll}>
							{pages.map((pageSlots, p) => (
								<div key={p} className={styles.pageWrapper}>
									<span className={styles.pageNumber}>{p + 1}</span>
									<div
										className={styles.pagePreview}
										style={{ width: PREVIEW_PX, height: PREVIEW_PX * (PAGE_H_MM / PAGE_W_MM) }}
									>
										<div
											className={styles.pageInner}
											style={{
												top: marginPx,
												left: marginPx,
												right: marginPx,
												bottom: marginPx,
											}}
										>
											{pageSlots.map((slot, i) => (
												<PreviewCardImage
													key={`${slot.card.entry.rowId}-${slot.faceIndex}`}
													slot={slot}
													cardWPx={cardWPx}
													cardHPx={cardHPx}
													col={i % layout.cols}
													row={Math.floor(i / layout.cols)}
													gapPx={gapPx}
													cutLines={settings.cutLines}
												/>
											))}
										</div>
									</div>
								</div>
							))}
						</div>
					</div>
				</div>

				{/* ── Card list preview ── */}
				<div className={styles.cardListPanel}>
					<p className={styles.sectionTitle}>
						{cards.length} carte{cards.length !== 1 ? 's' : ''}
					</p>
					<div className={styles.cardListWrapper}>
						<CardList cards={cards} viewModes={['grid', 'table']} pageSize={false} />
					</div>
				</div>
			</div>

			<div className={styles.actions}>
				<Button variant="secondary" size="sm" onClick={onClose} disabled={generating}>
					Cancel
				</Button>
				<Button
					variant="primary"
					size="sm"
					onClick={() => onConfirm(settings)}
					disabled={generating}
				>
					{generating ? 'Generating…' : 'Generate'}
				</Button>
			</div>
		</Modal>
	);
}
