'use client';

import { useState } from 'react';
import { FEATURES } from '@/themes/_shared/mockData';
import { useScrollReveal } from '@/themes/_shared/useScrollReveal';
import styles from './ForgeFeatures.module.css';

export function ForgeFeatures() {
	const [active, setActive] = useState<number | null>(null);
	const [headerRef, headerVisible] = useScrollReveal({ threshold: 0.3 });
	const [stripRef, stripVisible] = useScrollReveal({ threshold: 0.15 });

	return (
		<section className={styles.section}>
			<div
				ref={headerRef}
				className={`${styles.headingWrapper} ${headerVisible ? styles.visible : ''}`}
			>
				<h2 className={styles.heading}>Arcane Abilities</h2>
			</div>

			<div ref={stripRef} className={`${styles.strip} ${stripVisible ? styles.visible : ''}`}>
				{FEATURES.map((feature, i) => (
					<div
						key={feature.title}
						className={`${styles.cell} ${active === i ? styles.cellActive : ''}`}
						style={{ transitionDelay: `${i * 0.08}s` }}
						onMouseEnter={() => setActive(i)}
						onMouseLeave={() => setActive(null)}
					>
						<span className={styles.icon}>{feature.icon}</span>
						<div className={styles.reveal}>
							<h3 className={styles.cellTitle}>{feature.title}</h3>
							<p className={styles.cellDescription}>{feature.description}</p>
						</div>
						<div className={styles.glowBar} />
					</div>
				))}
			</div>
		</section>
	);
}
