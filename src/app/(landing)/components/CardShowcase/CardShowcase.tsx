'use client';

import Image from 'next/image';
import { useInView } from '@/app/(landing)/hooks/useInView';
import { CardList } from '@/lib/card/components/CardList/CardList';
import type { AnyCard, CardListSection } from '@/lib/card/components/CardList/CardList.types';
import { SHOWCASE_SECTIONS, type ShowcaseCard } from './showcaseData';
import styles from './CardShowcase.module.css';

const sections: CardListSection[] = SHOWCASE_SECTIONS.map((group) => ({
	label: group.label,
	cards: group.cards as unknown as AnyCard[],
}));

function renderShowcaseItem(card: AnyCard, index: number) {
	const showcase = card as unknown as ShowcaseCard;
	return (
		<div key={showcase.id} className={styles.item} style={{ transitionDelay: `${index * 0.06}s` }}>
			<p className={styles.cardName}>{showcase.name}</p>
			<div className={styles.imageWrapper}>
				<Image
					src={showcase.src}
					alt={showcase.name}
					width={488}
					height={680}
					className={styles.cardImage}
					sizes="(max-width: 768px) 45vw, 220px"
				/>
			</div>
		</div>
	);
}

export function CardShowcase() {
	const [headerRef, headerInView] = useInView({ threshold: 0.3 });
	const [sectionsRef, sectionsInView] = useInView({ threshold: 0.1 });

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

			<div
				ref={sectionsRef}
				className={`${styles.sectionsWrapper} ${sectionsInView ? styles.visible : ''}`}
			>
				<CardList
					cards={sections}
					pageSize={false}
					renderItem={renderShowcaseItem}
					sectionClassName={styles.sectionAnimated}
				/>
			</div>
		</section>
	);
}
