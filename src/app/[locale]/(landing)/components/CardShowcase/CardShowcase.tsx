'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { isScryfallImageUrl, scryfallImageLoader } from '@/lib/scryfall/utils/scryfallImageLoader';
import { useInView } from '@/app/[locale]/(landing)/hooks/useInView';
import { CardList } from '@/lib/card/components/CardList/CardList';
import type { AnyCard, CardListSection } from '@/lib/card/components/CardList/CardList.types';
import { SHOWCASE_SECTIONS, type ShowcaseCard } from './showcaseData';
import styles from './CardShowcase.module.css';

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
					loader={scryfallImageLoader}
					unoptimized={isScryfallImageUrl(showcase.src)}
					className={styles.cardImage}
					sizes="(max-width: 768px) 45vw, 220px"
				/>
			</div>
		</div>
	);
}

export function CardShowcase() {
	const t = useTranslations('landing.showcase');
	const [headerRef, headerInView] = useInView({ threshold: 0.3 });
	const [sectionsRef, sectionsInView] = useInView({ threshold: 0.1 });

	const sections: CardListSection[] = SHOWCASE_SECTIONS.map((group) => ({
		label: t(group.labelKey, { count: group.cards.length }),
		cards: group.cards as unknown as AnyCard[],
	}));

	return (
		<section className={styles.showcase}>
			<div
				ref={headerRef}
				className={`${styles.headerBlock} ${headerInView ? styles.visible : ''}`}
			>
				<div className={styles.header}>
					<div className={styles.ornamentLine} />
					<h2 className={styles.heading}>{t('heading')}</h2>
					<div className={styles.ornamentLine} />
				</div>
				<p className={styles.subheading}>{t('subheading')}</p>
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
