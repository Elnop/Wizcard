'use client';

import Link from 'next/link';
import { ForgeButton } from '../components/ForgeButton/ForgeButton';
import { useScrollReveal } from '@/themes/_shared/useScrollReveal';
import styles from './ForgeCTA.module.css';

export function ForgeCTA() {
	const [ref, visible] = useScrollReveal({ threshold: 0.3 });

	return (
		<section ref={ref} className={`${styles.section} ${visible ? styles.visible : ''}`}>
			<div className={styles.orbOuter}>
				<div className={styles.orbInner} />
			</div>
			<div className={styles.content}>
				<h2 className={styles.title}>The Forge Awaits</h2>
				<p className={styles.description}>
					80,000+ cards. Infinite possibilities. Channel the arcane and build your ultimate
					collection.
				</p>
				<Link href="/search">
					<ForgeButton size="lg">Ignite the Forge</ForgeButton>
				</Link>
			</div>
		</section>
	);
}
