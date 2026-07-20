'use client';

import Image from 'next/image';
import { isScryfallImageUrl, scryfallImageLoader } from '@/lib/scryfall/utils/scryfallImageLoader';
import { COLLECTION_CARDS, COLLECTION_TARGET } from '@/app/[locale]/(landing)/data/demoContent';
import { seg } from '@/app/[locale]/(landing)/utils/seg';
import styles from './CollectionDemo.module.css';

export function CollectionDemo({ progress }: { progress: number }) {
	const fill = seg(progress, 0, 0.4);
	const count = Math.round(seg(progress, 0.3, 0.6) * COLLECTION_TARGET);
	const owned = seg(progress, 0.5, 0.75);
	const sync = seg(progress, 0.75, 1);
	const revealCount = Math.round(fill * COLLECTION_CARDS.length);

	return (
		<div className={styles.wrap}>
			<div className={styles.counter}>{count.toLocaleString()}</div>
			<div className={styles.grid}>
				{COLLECTION_CARDS.map((card, i) => (
					<div key={i} className={styles.cell} style={{ opacity: i < revealCount ? 1 : 0.05 }}>
						<Image
							src={card.src}
							alt={card.name}
							width={122}
							height={170}
							loader={scryfallImageLoader}
							unoptimized={isScryfallImageUrl(card.src)}
							sizes="90px"
						/>
						{i === 4 ? (
							<span className={styles.check} style={{ opacity: owned }}>
								{'✓'}
							</span>
						) : null}
					</div>
				))}
			</div>
			<div className={styles.sync} style={{ opacity: sync }}>
				<span className={styles.device}>{'▢'}</span>
				<span className={styles.wire} style={{ transform: `scaleX(${sync})` }} />
				<span className={styles.device}>{'▭'}</span>
			</div>
		</div>
	);
}
