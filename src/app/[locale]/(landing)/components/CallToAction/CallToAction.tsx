'use client';

import { Link } from '@/i18n/navigation';
import { Button } from '@/components/Button/Button';
import { useInView } from '@/app/[locale]/(landing)/hooks/useInView';
import styles from './CallToAction.module.css';

export function CallToAction() {
	const [ref, inView] = useInView({ threshold: 0.3 });

	return (
		<section ref={ref} className={`${styles.section} ${inView ? styles.visible : ''}`}>
			<div className={styles.frame}>
				<div className={styles.frameLine} />
				<div className={styles.content}>
					<div className={styles.diamond} />
					<h2 className={styles.title}>Ready to Explore?</h2>
					<p className={styles.description}>
						Search through over 80,000 unique Magic: The Gathering cards. Build and manage your
						collection with ease.
					</p>
					<Link href="/search">
						<Button size="lg">Start Searching</Button>
					</Link>
				</div>
				<div className={styles.frameLine} />
			</div>
		</section>
	);
}
