'use client';

import { SHOWCASE_SECTIONS } from '@/themes/_shared/mockData';
import { useScrollReveal } from '@/themes/_shared/useScrollReveal';
import { LibraryCardFrame } from '../components/LibraryCardFrame/LibraryCardFrame';
import styles from './LibraryShowcase.module.css';

function ShowcaseSection({ group }: { group: (typeof SHOWCASE_SECTIONS)[number] }) {
	const [ref, visible] = useScrollReveal({ threshold: 0.1 });

	return (
		<div ref={ref} className={`${styles.sectionWrapper} ${visible ? styles.visible : ''}`}>
			<div className={styles.sectionHeader}>
				<span>{group.title}</span>
				<span className={styles.sectionCount}>({group.cards.length})</span>
			</div>
			<div className={styles.grid}>
				{group.cards.map((card, i) => (
					<div key={card.name} className={styles.item} style={{ transitionDelay: `${i * 0.05}s` }}>
						<p className={styles.cardName}>{card.name}</p>
						<LibraryCardFrame src={card.src} alt={card.name} />
					</div>
				))}
			</div>
		</div>
	);
}

export function LibraryShowcase() {
	const [headerRef, headerVisible] = useScrollReveal({ threshold: 0.3 });

	return (
		<section className={styles.section}>
			<div
				ref={headerRef}
				className={`${styles.headerBlock} ${headerVisible ? styles.visible : ''}`}
			>
				<h2 className={styles.heading}>The Archives</h2>
				<p className={styles.subheading}>
					A curated selection of legendary cards, preserved in the scholarly tradition.
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
