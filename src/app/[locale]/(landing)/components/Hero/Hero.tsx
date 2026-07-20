'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/Button/Button';
import { BRAND_FONT_FAMILY } from '@/fonts/brand';
import { useScrollProgress } from '@/app/[locale]/(landing)/hooks/useScrollProgress';
import { useReducedMotion } from '@/app/[locale]/(landing)/hooks/useReducedMotion';
import styles from './Hero.module.css';

export function Hero() {
	const t = useTranslations('landing.hero');
	const ref = useRef<HTMLElement>(null);
	const reduced = useReducedMotion();
	const p = useScrollProgress(ref);
	const shift = reduced ? 0 : p;

	return (
		<section ref={ref} className={styles.hero}>
			<div className={styles.veil} />
			<div className={styles.content}>
				<div className={styles.mark} style={{ transform: `translateY(${shift * -40}px)` }}>
					{/*
					 * Wordmark décoratif : le "W" négatif + le mot rendus avec la brand
					 * font. Le nom "Wizcard" et l'objectif restent énoncés visiblement
					 * dans la tagline ci-dessous (vérification de marque Google à l'œil).
					 */}
					<span className={styles.wGlyph} style={{ fontFamily: BRAND_FONT_FAMILY }}>
						{'W'}
					</span>
					<span className={styles.wordmark} style={{ fontFamily: BRAND_FONT_FAMILY }}>
						WIZCARD
					</span>
				</div>
				<div className={styles.titleRule} />
				<p className={styles.tagline}>{t('tagline')}</p>
				<p className={styles.description}>{t('description')}</p>
				<div className={styles.cta}>
					<Link href="/search">
						<Button size="lg">{t('explore')}</Button>
					</Link>
					<Link href="/collection">
						<Button variant="ghost" size="lg">
							{t('myCollection')}
						</Button>
					</Link>
				</div>
			</div>
			<div className={styles.scrollHint}>
				<span className={styles.scrollDiamond} />
				<span className={styles.scrollLine} />
			</div>
		</section>
	);
}
