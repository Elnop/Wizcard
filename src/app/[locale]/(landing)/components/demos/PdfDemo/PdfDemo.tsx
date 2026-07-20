'use client';

import Image from 'next/image';
import { isScryfallImageUrl, scryfallImageLoader } from '@/lib/scryfall/utils/scryfallImageLoader';
import { COLLECTION_CARDS } from '@/app/[locale]/(landing)/data/demoContent';
import { seg } from '@/app/[locale]/(landing)/utils/seg';
import styles from './PdfDemo.module.css';

export function PdfDemo({ progress, readyLabel }: { progress: number; readyLabel: string }) {
	const drop = seg(progress, 0, 0.5);
	const fold = seg(progress, 0.5, 0.8);
	const badge = seg(progress, 0.8, 1);
	const nine = COLLECTION_CARDS.slice(0, 9);

	return (
		<div className={styles.wrap}>
			<div
				className={styles.sheet}
				style={{ transform: `perspective(900px) rotateX(${fold * 35}deg)` }}
			>
				{nine.map((card, i) => {
					const local = Math.min(1, Math.max(0, drop * 9 - i));
					return (
						<div
							key={i}
							className={styles.cell}
							style={{ opacity: local, transform: `translateY(${(1 - local) * -16}px)` }}
						>
							<Image
								src={card.src}
								alt={card.name}
								width={80}
								height={112}
								loader={scryfallImageLoader}
								unoptimized={isScryfallImageUrl(card.src)}
								sizes="60px"
							/>
						</div>
					);
				})}
			</div>
			<span className={styles.badge} style={{ opacity: badge }}>
				{readyLabel}
			</span>
		</div>
	);
}
