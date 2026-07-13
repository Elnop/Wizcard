'use client';

import { Link } from '@/i18n/navigation';
import { Button } from '@/components/Button/Button';
import { RandomBackdrop } from './backdrops/RandomBackdrop';
import styles from './Hero.module.css';

export function Hero() {
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
					<h1 className={styles.title}>WIZCARD</h1>
					<div className={styles.titleRule} />
					<p className={styles.tagline}>Your complete Magic: The Gathering companion</p>
					<p className={styles.description}>
						Search, collect, and manage every Magic card ever printed. Powerful filters, offline
						sync, and bulk import — all in one place.
					</p>

					<div className={styles.cta}>
						<Link href="/search">
							<Button size="lg">Start Searching</Button>
						</Link>
						<Link href="/collection">
							<Button variant="ghost" size="lg">
								My Collection
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
