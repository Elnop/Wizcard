'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/Button/Button';
import { useBrandFont } from '@/contexts/BrandFontProvider';
import { RandomBackdrop } from './backdrops/RandomBackdrop';
import styles from './Hero.module.css';

export function Hero() {
	const t = useTranslations('landing.hero');
	const { font, reroll } = useBrandFont();
	return (
		<section className={styles.hero}>
			<div className={styles.background}>
				<div className={styles.gradient} />
				<div className={styles.decoLines} />
				<div className={styles.shimmer} />
			</div>

			{/* Art Deco corner frames */}
			<div className={styles.frameTL} />
			<div className={styles.frameTR} />
			<div className={styles.frameBL} />
			<div className={styles.frameBR} />

			<div className={styles.content}>
				{/* Random geometric backdrop */}
				<RandomBackdrop />

				<div className={styles.textBlock}>
					<div className={styles.diamondOrnament} />
					<h1
						className={styles.title}
						style={{ fontFamily: font?.cssVar }}
						role="button"
						tabIndex={0}
						onClick={reroll}
						onKeyDown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								reroll();
							}
						}}
					>
						WIZCARD
					</h1>
					<div className={styles.titleRule} />
					<p className={styles.tagline}>{t('tagline')}</p>
					<p className={styles.description}>{t('description')}</p>

					<div className={styles.cta}>
						<Link href="/search">
							<Button size="lg">{t('startSearching')}</Button>
						</Link>
						<Link href="/collection">
							<Button variant="ghost" size="lg">
								{t('myCollection')}
							</Button>
						</Link>
					</div>
				</div>

				<div className={styles.scrollIndicator}>
					<div className={styles.scrollDiamond} />
					<div className={styles.scrollLine} />
				</div>
			</div>
		</section>
	);
}
