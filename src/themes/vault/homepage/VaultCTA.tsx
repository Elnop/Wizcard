'use client';

import Link from 'next/link';
import { VaultButton } from '../components/VaultButton/VaultButton';
import { useScrollReveal } from '@/themes/_shared/useScrollReveal';
import styles from './VaultCTA.module.css';

export function VaultCTA() {
	const [ref, visible] = useScrollReveal({ threshold: 0.3 });

	return (
		<section ref={ref} className={`${styles.section} ${visible ? styles.visible : ''}`}>
			<div className={styles.frame}>
				<div className={styles.frameLine} />
				<div className={styles.content}>
					<div className={styles.diamond} />
					<h2 className={styles.title}>Begin Your Collection</h2>
					<p className={styles.description}>
						Over 80,000 unique cards. Search, collect, and manage — all in one vault.
					</p>
					<Link href="/search">
						<VaultButton size="lg">Enter the Vault</VaultButton>
					</Link>
				</div>
				<div className={styles.frameLine} />
			</div>
		</section>
	);
}
