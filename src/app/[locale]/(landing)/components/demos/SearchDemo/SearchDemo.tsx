'use client';

import Image from 'next/image';
import { isScryfallImageUrl, scryfallImageLoader } from '@/lib/scryfall/utils/scryfallImageLoader';
import { SEARCH_CARDS } from '@/app/[locale]/(landing)/data/demoContent';
import { seg } from '@/app/[locale]/(landing)/utils/seg';
import styles from './SearchDemo.module.css';

const QUERY = 'Lightning Bolt';

export function SearchDemo({ progress }: { progress: number }) {
	const typed = seg(progress, 0, 0.3);
	const cardsIn = seg(progress, 0.4, 0.7);
	const lift = seg(progress, 0.7, 1);
	const shown = QUERY.slice(0, Math.round(QUERY.length * typed));

	return (
		<div className={styles.wrap}>
			<div className={styles.bar}>
				<span className={styles.icon}>{'⌕'}</span>
				<span className={styles.query}>{shown}</span>
				<span className={styles.caret} />
			</div>
			<div className={styles.results}>
				{SEARCH_CARDS.map((card, i) => {
					const local = Math.min(1, Math.max(0, cardsIn * 3 - i));
					const isHero = i === 0;
					const style = {
						opacity: local,
						transform: `translateY(${(1 - local) * 24}px) ${
							isHero ? `scale(${1 + lift * 0.3}) rotate(${-lift * 4}deg)` : ''
						}`,
						zIndex: isHero ? 3 : 1,
					};
					return (
						<div key={i} className={styles.card} style={style}>
							<Image
								src={card.src}
								alt={card.name}
								width={244}
								height={340}
								loader={scryfallImageLoader}
								unoptimized={isScryfallImageUrl(card.src)}
								sizes="200px"
							/>
						</div>
					);
				})}
			</div>
		</div>
	);
}
