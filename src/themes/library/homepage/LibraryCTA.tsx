'use client';

import Link from 'next/link';
import { LibraryButton } from '../components/LibraryButton/LibraryButton';
import { useScrollReveal } from '@/themes/_shared/useScrollReveal';
import styles from './LibraryCTA.module.css';

export function LibraryCTA() {
	const [ref, visible] = useScrollReveal({ threshold: 0.3 });

	return (
		<section ref={ref} className={`${styles.section} ${visible ? styles.visible : ''}`}>
			<div className={styles.content}>
				<p className={styles.quote}>
					&ldquo;A well-ordered collection is worth more than any single card within it.&rdquo;
				</p>
				<div className={styles.rule} />
				<p className={styles.description}>
					Over 80,000 unique cards await. Begin your cataloguing today.
				</p>
				<Link href="/search">
					<LibraryButton size="lg">Open the Archives</LibraryButton>
				</Link>
			</div>
		</section>
	);
}
