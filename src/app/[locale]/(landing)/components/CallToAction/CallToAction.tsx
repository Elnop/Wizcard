'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/Button/Button';
import { useInView } from '@/app/[locale]/(landing)/hooks/useInView';
import styles from './CallToAction.module.css';

export function CallToAction() {
	const t = useTranslations('landing.cta');
	const [ref, inView] = useInView({ threshold: 0.3 });

	return (
		<section ref={ref} className={`${styles.section} ${inView ? styles.visible : ''}`}>
			<div className={styles.frame}>
				<div className={styles.frameLine} />
				<div className={styles.content}>
					<div className={styles.diamond} />
					<h2 className={styles.title}>{t('title')}</h2>
					<p className={styles.description}>{t('description')}</p>
					<Link href="/search">
						<Button size="lg">{t('startSearching')}</Button>
					</Link>
				</div>
				<div className={styles.frameLine} />
			</div>
		</section>
	);
}
