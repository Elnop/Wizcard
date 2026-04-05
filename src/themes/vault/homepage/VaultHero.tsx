'use client';

import Image from 'next/image';
import Link from 'next/link';
import { VaultButton } from '../components/VaultButton/VaultButton';
import { useScrollReveal } from '@/themes/_shared/useScrollReveal';
import styles from './VaultHero.module.css';

export function VaultHero() {
	const [ref, visible] = useScrollReveal({ threshold: 0.1 });

	return (
		<section ref={ref} className={`${styles.hero} ${visible ? styles.visible : ''}`}>
			<div className={styles.background}>
				<div className={styles.gradient} />
				<div className={styles.decoLines} />
				<div className={styles.shimmer} />
			</div>

			{/* Art Deco frame border */}
			<div className={styles.frameTL} />
			<div className={styles.frameTR} />
			<div className={styles.frameBL} />
			<div className={styles.frameBR} />

			<div className={styles.content}>
				{/* Central card as backdrop */}
				<div className={styles.cardBackdrop}>
					<Image
						src="https://cards.scryfall.io/normal/front/b/d/bd8fa327-dd41-4737-8f19-2cf5eb1f7cdd.jpg"
						alt="Black Lotus"
						width={488}
						height={680}
						className={styles.backdropImage}
						priority
						sizes="(max-width: 768px) 300px, 400px"
					/>
					<div className={styles.backdropOverlay} />
				</div>

				<div className={styles.textBlock}>
					<div className={styles.diamondOrnament} />
					<h1 className={styles.title}>WIZCARD</h1>
					<div className={styles.titleRule} />
					<p className={styles.tagline}>The Collector&apos;s Vault</p>
					<p className={styles.description}>
						Every Magic: The Gathering card ever printed. Catalogued, curated, and at your command.
					</p>

					<div className={styles.cta}>
						<Link href="/search">
							<VaultButton size="lg">Enter the Vault</VaultButton>
						</Link>
						<Link href="/collection">
							<VaultButton variant="ghost" size="lg">
								My Collection
							</VaultButton>
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
