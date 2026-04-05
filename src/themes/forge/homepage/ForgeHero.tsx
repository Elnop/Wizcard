'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ForgeButton } from '../components/ForgeButton/ForgeButton';
import { useScrollReveal } from '@/themes/_shared/useScrollReveal';
import styles from './ForgeHero.module.css';

const FLOATING_CARDS = [
	{
		name: 'Black Lotus',
		src: 'https://cards.scryfall.io/normal/front/b/d/bd8fa327-dd41-4737-8f19-2cf5eb1f7cdd.jpg',
		glow: 'var(--arcane-gold)',
	},
	{
		name: 'Force of Will',
		src: 'https://cards.scryfall.io/normal/front/8/9/89f612d6-7c59-4a7b-a87d-45f789e88ba5.jpg',
		glow: 'var(--mystic-blue)',
	},
	{
		name: 'Liliana of the Veil',
		src: 'https://cards.scryfall.io/normal/front/d/1/d12c8c97-6491-452c-811d-943441a7ef9f.jpg',
		glow: 'var(--violet)',
	},
	{
		name: 'Lightning Bolt',
		src: 'https://cards.scryfall.io/normal/front/7/7/77c6fa74-5543-42ac-9ead-0e890b188e99.jpg',
		glow: 'var(--ember)',
	},
];

export function ForgeHero() {
	const [ref, visible] = useScrollReveal({ threshold: 0.1 });

	return (
		<section ref={ref} className={`${styles.hero} ${visible ? styles.visible : ''}`}>
			<div className={styles.background}>
				<div className={styles.gradient} />
				<div className={styles.particles} />
				<div className={styles.orbGlow} />
				<div className={styles.energyLines} />
			</div>

			{/* Floating cards behind text */}
			<div className={styles.floatingCards}>
				{FLOATING_CARDS.map((card, i) => (
					<div
						key={card.name}
						className={styles.floatingCard}
						style={
							{
								'--i': i,
								'--glow': card.glow,
							} as React.CSSProperties
						}
					>
						<Image
							src={card.src}
							alt={card.name}
							width={488}
							height={680}
							className={styles.floatingImage}
							sizes="160px"
						/>
					</div>
				))}
			</div>

			<div className={styles.content}>
				<div className={styles.glowRing} />
				<p className={styles.preTitle}>The</p>
				<h1 className={styles.title}>Mana Forge</h1>
				<p className={styles.subtitle}>Channel the arcane. Master every card.</p>

				<p className={styles.description}>
					Search, collect, and command over 80,000 Magic: The Gathering cards. Powered by ancient
					energy.
				</p>

				<div className={styles.cta}>
					<Link href="/search">
						<ForgeButton size="lg">Ignite the Forge</ForgeButton>
					</Link>
					<Link href="/collection">
						<ForgeButton variant="ghost" size="lg">
							My Collection
						</ForgeButton>
					</Link>
				</div>

				<div className={styles.scrollIndicator}>
					<div className={styles.scrollOrb} />
					<div className={styles.scrollTrail} />
				</div>
			</div>
		</section>
	);
}
