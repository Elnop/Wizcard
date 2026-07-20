'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/Button/Button';
import { BRAND_FONT_FAMILY } from '@/fonts/brand';
import styles from './FinalCTA.module.css';

export function FinalCTA() {
	const t = useTranslations('landing.finalCta');
	return (
		<section className={styles.section}>
			<span className={styles.w} style={{ fontFamily: BRAND_FONT_FAMILY }}>
				{'W'}
			</span>
			<div className={styles.diamond} />
			<h2 className={styles.title}>{t('title')}</h2>
			<div className={styles.cta}>
				<Link href="/search">
					<Button size="lg">{t('start')}</Button>
				</Link>
				<Link href="/decks">
					<Button variant="ghost" size="lg">
						{t('publicDecks')}
					</Button>
				</Link>
			</div>
		</section>
	);
}
