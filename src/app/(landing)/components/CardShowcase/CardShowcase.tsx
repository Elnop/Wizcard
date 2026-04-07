'use client';

import Image from 'next/image';
import { useInView } from '@/app/(landing)/hooks/useInView';
import { SHOWCASE_SECTIONS } from './showcaseData';
import styles from './CardShowcase.module.css';

function ShowcaseSection({ group }: { group: (typeof SHOWCASE_SECTIONS)[number] }) {
	const [ref, inView] = useInView({ threshold: 0.1 });

	return (
		<div ref={ref} className={`${styles.sectionWrapper} ${inView ? styles.visible : ''}`}>
			<div className={styles.sectionHeader}>
				<span>{group.title}</span>
				<span className={styles.sectionCount}>({group.cards.length})</span>
			</div>
			<div className={styles.grid}>
				{group.cards.map((card, i) => (
					<div key={card.name} className={styles.item} style={{ transitionDelay: `${i * 0.06}s` }}>
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
	);
}

export function CardShowcase() {
	const [headerRef, headerInView] = useInView({ threshold: 0.3 });

	return (
		<section className={styles.showcase}>
			<div
				ref={headerRef}
				className={`${styles.headerBlock} ${headerInView ? styles.visible : ''}`}
			>
				<div className={styles.header}>
					<div className={styles.ornamentLine} />
					<h2 className={styles.heading}>Explore Iconic Cards</h2>
					<div className={styles.ornamentLine} />
				</div>
				<p className={styles.subheading}>
					From the Power Nine to modern staples — every card at your fingertips.
				</p>
			</div>

			<div className={styles.sections}>
				{SHOWCASE_SECTIONS.map((group) => (
					<ShowcaseSection key={group.title} group={group} />
				))}
			</div>
		</section>
	);
}
