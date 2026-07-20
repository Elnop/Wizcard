'use client';

import Image from 'next/image';
import { isScryfallImageUrl, scryfallImageLoader } from '@/lib/scryfall/utils/scryfallImageLoader';
import {
	IMPORT_RECOGNIZED,
	IMPORT_SOURCES,
	SEARCH_CARDS,
} from '@/app/[locale]/(landing)/data/demoContent';
import { seg } from '@/app/[locale]/(landing)/utils/seg';
import styles from './ImportDemo.module.css';

const DECKLIST = '4 Lightning Bolt\n3 Goblin Guide\n2 Monastery Swiftspear';

export function ImportDemo({
	progress,
	recognizedLabel,
}: {
	progress: number;
	recognizedLabel: (count: number) => string;
}) {
	const drop = seg(progress, 0, 0.4);
	const resolve = seg(progress, 0.4, 0.7);
	const done = seg(progress, 0.7, 1);
	const recognized = Math.round(done * IMPORT_RECOGNIZED);

	return (
		<div className={styles.wrap}>
			<div className={styles.sources}>
				{IMPORT_SOURCES.map((s, i) => {
					const local = Math.min(1, Math.max(0, drop * IMPORT_SOURCES.length - i));
					return (
						<span
							key={s}
							className={styles.chip}
							style={{
								opacity: local,
								transform: `translateY(${(1 - local) * -20}px)`,
							}}
						>
							{s}
						</span>
					);
				})}
			</div>
			<div className={styles.box}>
				<pre className={styles.text} style={{ opacity: 1 - resolve }}>
					{DECKLIST}
				</pre>
				<div className={styles.cards} style={{ opacity: resolve }}>
					{SEARCH_CARDS.map((c, i) => (
						<Image
							key={i}
							src={c.src}
							alt={c.name}
							width={80}
							height={112}
							loader={scryfallImageLoader}
							unoptimized={isScryfallImageUrl(c.src)}
							sizes="60px"
						/>
					))}
				</div>
			</div>
			<div className={styles.progress}>
				<span className={styles.fill} style={{ transform: `scaleX(${done})` }} />
			</div>
			<p className={styles.count} style={{ opacity: done }}>
				{recognizedLabel(recognized)}
			</p>
		</div>
	);
}
