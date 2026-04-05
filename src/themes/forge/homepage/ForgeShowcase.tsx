'use client';

import { SHOWCASE_SECTIONS } from '@/themes/_shared/mockData';
import { useScrollReveal } from '@/themes/_shared/useScrollReveal';
import { ForgeCardFrame } from '../components/ForgeCardFrame/ForgeCardFrame';
import styles from './ForgeShowcase.module.css';

const SECTION_GLOWS: Record<string, string> = {
	'Legendary Staples': 'var(--arcane-gold)',
	'Modern Classics': 'var(--mystic-blue)',
};

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
						<ForgeCardFrame src={card.src} alt={card.name} glowColor={SECTION_GLOWS[group.title]} />
					</div>
				))}
			</div>
		</div>
	);
}

export function ForgeShowcase() {
	const [headerRef, headerVisible] = useScrollReveal({ threshold: 0.3 });

	return (
		<section className={styles.section}>
			<div
				ref={headerRef}
				className={`${styles.headerBlock} ${headerVisible ? styles.visible : ''}`}
			>
				<h2 className={styles.heading}>The Arcane Collection</h2>
				<p className={styles.subheading}>
					Legendary cards forged in mystic energy, each radiating their own aura.
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
