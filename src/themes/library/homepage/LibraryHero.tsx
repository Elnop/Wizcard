'use client';

import Link from 'next/link';
import { LibraryButton } from '../components/LibraryButton/LibraryButton';
import { useScrollReveal } from '@/themes/_shared/useScrollReveal';
import styles from './LibraryHero.module.css';

export function LibraryHero() {
	const [ref, visible] = useScrollReveal({ threshold: 0.1 });

	return (
		<section ref={ref} className={`${styles.hero} ${visible ? styles.visible : ''}`}>
			<div className={styles.background}>
				<div className={styles.texture} />
				<div className={styles.dustParticles} />
			</div>

			<div className={styles.content}>
				<p className={styles.epigraph}>
					&ldquo;The greatest library is not the one with the most books, but the one where every
					tome can be found.&rdquo;
				</p>

				<div className={styles.rule} />

				<h1 className={styles.title}>
					<span className={styles.titleSmall}>The Planeswalker&apos;s</span>
					<span className={styles.titleMain}>Library</span>
				</h1>

				<p className={styles.description}>
					A scholar&apos;s companion for Magic: The Gathering. Search the archives, catalogue your
					collection, and study every card ever printed.
				</p>

				<div className={styles.cta}>
					<Link href="/search">
						<LibraryButton size="lg">Browse the Archives</LibraryButton>
					</Link>
					<Link href="/collection">
						<LibraryButton variant="ghost" size="lg">
							My Collection
						</LibraryButton>
					</Link>
				</div>

				<div className={styles.scrollHint}>
					<span className={styles.scrollLine} />
					<span className={styles.scrollText}>Scroll to explore</span>
				</div>
			</div>
		</section>
	);
}
