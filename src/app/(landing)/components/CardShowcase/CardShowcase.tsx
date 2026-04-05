'use client';

import Image from 'next/image';
import { useInView } from '@/app/(landing)/hooks/useInView';
import { SHOWCASE_SECTIONS } from '@/themes/_shared/mockData';
import styles from './CardShowcase.module.css';

export function CardShowcase() {
	const [ref, inView] = useInView({ threshold: 0.1 });

	return (
		<section ref={ref} className={`${styles.showcase} ${inView ? styles.visible : ''}`}>
			<h2 className={styles.heading}>Explore Iconic Cards</h2>
			<p className={styles.subheading}>
				From the Power Nine to modern staples — every card at your fingertips.
			</p>

			<div className={styles.sections}>
				{SHOWCASE_SECTIONS.map((group, gi) => (
					<div
						key={group.title}
						className={styles.sectionWrapper}
						style={{ '--group-delay': `${gi * 0.15}s` } as React.CSSProperties}
					>
						<div className={styles.sectionHeader}>
							<span>{group.title}</span>
							<span className={styles.sectionCount}>({group.cards.length})</span>
						</div>
						<div className={styles.grid}>
							{group.cards.map((card, ci) => (
								<div
									key={card.name}
									className={styles.item}
									style={{ '--delay': `${gi * 0.15 + ci * 0.1}s` } as React.CSSProperties}
								>
									<p className={styles.cardName}>{card.name}</p>
									<div className={styles.imageWrapper}>
										<Image
											src={card.src}
											alt={card.name}
											width={488}
											height={680}
											className={styles.cardImage}
											sizes="(max-width: 768px) 45vw, 220px"
										/>
									</div>
								</div>
							))}
						</div>
					</div>
				))}
			</div>
		</section>
	);
}
