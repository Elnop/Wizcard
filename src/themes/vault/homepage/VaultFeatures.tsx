'use client';

import { FEATURES } from '@/themes/_shared/mockData';
import { useScrollReveal } from '@/themes/_shared/useScrollReveal';
import styles from './VaultFeatures.module.css';

export function VaultFeatures() {
	const [headerRef, headerVisible] = useScrollReveal({ threshold: 0.3 });
	const [mainRef, mainVisible] = useScrollReveal({ threshold: 0.15 });
	const [sideRef, sideVisible] = useScrollReveal({ threshold: 0.15 });

	const mainFeatures = FEATURES.slice(0, 2);
	const sideFeatures = FEATURES.slice(2);

	return (
		<section className={styles.section}>
			<div ref={headerRef} className={`${styles.header} ${headerVisible ? styles.visible : ''}`}>
				<div className={styles.ornamentLine} />
				<h2 className={styles.heading}>Everything You Need</h2>
				<div className={styles.ornamentLine} />
			</div>

			<div className={styles.layout}>
				<div ref={mainRef} className={`${styles.mainColumn} ${mainVisible ? styles.visible : ''}`}>
					{mainFeatures.map((feature, i) => (
						<div
							key={feature.title}
							className={styles.mainCard}
							style={{ transitionDelay: `${i * 0.15}s` }}
						>
							<div className={styles.cornerTL} />
							<div className={styles.cornerBR} />
							<div className={styles.mainIcon}>{feature.icon}</div>
							<h3 className={styles.mainTitle}>{feature.title}</h3>
							<p className={styles.mainDescription}>{feature.description}</p>
							<div className={styles.cardShine} />
						</div>
					))}
				</div>

				<div ref={sideRef} className={`${styles.sideColumn} ${sideVisible ? styles.visible : ''}`}>
					{sideFeatures.map((feature, i) => (
						<div
							key={feature.title}
							className={styles.sideCard}
							style={{ transitionDelay: `${i * 0.1}s` }}
						>
							<div className={styles.sideIcon}>{feature.icon}</div>
							<div>
								<h3 className={styles.sideTitle}>{feature.title}</h3>
								<p className={styles.sideDescription}>{feature.description}</p>
							</div>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
