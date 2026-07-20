'use client';

import Image from 'next/image';
import { isScryfallImageUrl, scryfallImageLoader } from '@/lib/scryfall/utils/scryfallImageLoader';
import {
	DECK_SAMPLE,
	deckColorSlices,
	deckCurve,
	deckTypeCounts,
	columnTint,
} from '@/app/[locale]/(landing)/data/demoContent';
import { seg } from '@/app/[locale]/(landing)/utils/seg';
import styles from './DeckDemo.module.css';

const CURVE = deckCurve(DECK_SAMPLE);
const SLICES = deckColorSlices(DECK_SAMPLE);
const TYPES = deckTypeCounts(DECK_SAMPLE);
const MAX_BAR = Math.max(...CURVE);

export function DeckDemo({ progress }: { progress: number }) {
	const deal = seg(progress, 0, 0.45); // cards deal in — hero beat
	const bars = seg(progress, 0.4, 0.7); // curve grows out of the cards
	const ring = seg(progress, 0.6, 0.85); // color ring sweeps
	const chips = seg(progress, 0.8, 1); // type chips resolve

	// Conic-gradient string whose colored arc sweeps in as `ring` goes 0 -> 1.
	const stops = SLICES.reduce<{ text: string[]; acc: number }>(
		(state, s) => {
			const start = state.acc;
			const end = start + s.pct;
			return { text: [...state.text, `${s.color} ${start * ring}% ${end * ring}%`], acc: end };
		},
		{ text: [], acc: 0 }
	).text.join(', ');

	// As the curve grows (bars > 0), cards recede/dim to hand focus to the stats.
	const cardsFocus = 1 - 0.55 * bars;

	return (
		<div className={styles.wrap}>
			<div className={styles.stage}>
				{/* Cards deal in first */}
				<div className={styles.hand} style={{ opacity: cardsFocus }}>
					{DECK_SAMPLE.map((card, i) => {
						const mid = (DECK_SAMPLE.length - 1) / 2;
						// Per-card stagger: each card finishes dealing a beat after the last.
						const local = Math.min(1, Math.max(0, deal * DECK_SAMPLE.length - i));
						const angle = (i - mid) * 6 * local;
						const y = Math.abs(i - mid) * 8 * local;
						// Deal from off-frame (right + down + tilted) into place.
						const dealX = (1 - local) * 260;
						const dealY = (1 - local) * 120;
						const dealRot = (1 - local) * 18;
						return (
							<div
								key={card.name}
								className={styles.handCard}
								style={{
									transform: `translate(${dealX}px, ${y + dealY}px) rotate(${angle + dealRot}deg)`,
									opacity: local,
								}}
							>
								<Image
									src={card.src}
									alt={card.name}
									width={98}
									height={137}
									loader={scryfallImageLoader}
									unoptimized={isScryfallImageUrl(card.src)}
									sizes="70px"
								/>
							</div>
						);
					})}
				</div>

				{/* Mana curve grows up from the card baseline */}
				<div className={styles.bars} style={{ opacity: bars }}>
					{CURVE.map((v, i) => {
						const local = Math.min(1, Math.max(0, bars * CURVE.length - i));
						const tint = columnTint(DECK_SAMPLE, i);
						return (
							<span
								key={i}
								className={styles.bar}
								style={{
									height: `${MAX_BAR ? (v / MAX_BAR) * 100 * local : 0}%`,
									background: tint ?? 'rgba(201, 168, 76, 0.85)',
								}}
							/>
						);
					})}
				</div>
			</div>

			{/* Color-identity ring */}
			<div
				className={styles.ring}
				style={{
					opacity: ring,
					background: `conic-gradient(${stops}, transparent ${ring * 100}% 100%)`,
				}}
			/>

			{/* Type distribution chips */}
			<div className={styles.chips} style={{ opacity: chips }}>
				{TYPES.map((t) => (
					<span key={t.type} className={styles.chip}>
						{t.type}
						<b>{t.count}</b>
					</span>
				))}
			</div>
		</div>
	);
}
