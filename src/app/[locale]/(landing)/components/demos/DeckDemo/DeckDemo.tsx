'use client';

import Image from 'next/image';
import { isScryfallImageUrl, scryfallImageLoader } from '@/lib/scryfall/utils/scryfallImageLoader';
import { COLOR_SLICES, HAND_CARDS, MANA_CURVE } from '@/app/[locale]/(landing)/data/demoContent';
import { seg } from '@/app/[locale]/(landing)/utils/seg';
import styles from './DeckDemo.module.css';

export function DeckDemo({ progress }: { progress: number }) {
	const bars = seg(progress, 0.3, 0.6);
	const ring = seg(progress, 0.5, 0.75);
	const fan = seg(progress, 0.75, 1);
	const maxBar = Math.max(...MANA_CURVE);

	// Build a conic-gradient string filled up to `ring` of the circle.
	const stops = COLOR_SLICES.reduce<{ text: string[]; acc: number }>(
		(state, s) => {
			const start = state.acc;
			const end = start + s.pct;
			return { text: [...state.text, `${s.color} ${start}% ${end}%`], acc: end };
		},
		{ text: [], acc: 0 }
	).text.join(', ');

	return (
		<div className={styles.wrap}>
			<div className={styles.chart}>
				<div className={styles.bars}>
					{MANA_CURVE.map((v, i) => {
						const local = Math.min(1, Math.max(0, bars * MANA_CURVE.length - i));
						return (
							<span
								key={i}
								className={styles.bar}
								style={{ height: `${(v / maxBar) * 100 * local}%` }}
							/>
						);
					})}
				</div>
				<div
					className={styles.ring}
					style={{
						background: `conic-gradient(${stops}, transparent ${ring * 100}% 100%)`,
					}}
				/>
			</div>
			<div className={styles.hand}>
				{HAND_CARDS.map((card, i) => {
					const mid = (HAND_CARDS.length - 1) / 2;
					const angle = (i - mid) * 8 * fan;
					const y = Math.abs(i - mid) * 10 * fan;
					return (
						<div
							key={i}
							className={styles.handCard}
							style={{ transform: `rotate(${angle}deg) translateY(${y}px)`, opacity: fan }}
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
		</div>
	);
}
