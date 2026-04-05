'use client';

import { FEATURES } from '@/themes/_shared/mockData';
import { useScrollReveal } from '@/themes/_shared/useScrollReveal';
import styles from './LibraryFeatures.module.css';

export function LibraryFeatures() {
	const [headerRef, headerVisible] = useScrollReveal({ threshold: 0.3 });
	const [listRef, listVisible] = useScrollReveal({ threshold: 0.1 });

	return (
		<section className={styles.section}>
			<div
				ref={headerRef}
				className={`${styles.headerBlock} ${headerVisible ? styles.visible : ''}`}
			>
				<h2 className={styles.heading}>Table of Contents</h2>
				<p className={styles.subheading}>
					The tools within these pages, catalogued for the discerning scholar.
				</p>
			</div>

			<div ref={listRef} className={`${styles.list} ${listVisible ? styles.visible : ''}`}>
				{FEATURES.map((feature, i) => (
					<div
						key={feature.title}
						className={styles.entry}
						style={{ transitionDelay: `${i * 0.12}s` }}
					>
						<span className={styles.number}>{String(i + 1).padStart(2, '0')}</span>
						<div className={styles.entryContent}>
							<h3 className={styles.entryTitle}>{feature.title}</h3>
							<p className={styles.entryDescription}>{feature.description}</p>
						</div>
						<div className={styles.dots} />
						<span className={styles.entryIcon}>{feature.icon}</span>
					</div>
				))}
			</div>
		</section>
	);
}
