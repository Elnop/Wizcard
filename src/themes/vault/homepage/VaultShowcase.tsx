'use client';

import { SHOWCASE_SECTIONS } from '@/themes/_shared/mockData';
import { useScrollReveal } from '@/themes/_shared/useScrollReveal';
import { VaultCardFrame } from '../components/VaultCardFrame/VaultCardFrame';
import styles from './VaultShowcase.module.css';

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
					<div key={card.name} className={styles.item} style={{ transitionDelay: `${i * 0.06}s` }}>
						<p className={styles.cardName}>{card.name}</p>
						<VaultCardFrame src={card.src} alt={card.name} />
					</div>
				))}
			</div>
		</div>
	);
}

export function VaultShowcase() {
	const [headerRef, headerVisible] = useScrollReveal({ threshold: 0.3 });

	return (
		<section className={styles.section}>
			<div
				ref={headerRef}
				className={`${styles.headerBlock} ${headerVisible ? styles.visible : ''}`}
			>
				<div className={styles.header}>
					<div className={styles.ornamentLine} />
					<h2 className={styles.heading}>The Collection</h2>
					<div className={styles.ornamentLine} />
				</div>
				<p className={styles.subheading}>
					Browse through iconic cards, beautifully framed in the Art Deco style.
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
