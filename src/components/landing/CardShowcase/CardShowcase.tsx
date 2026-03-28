'use client';

import Image from 'next/image';
import { useInView } from '@/hooks/useInView';
import styles from './CardShowcase.module.css';

const SHOWCASE_CARDS = [
	{
		name: 'Black Lotus',
		src: 'https://cards.scryfall.io/normal/front/b/d/bd8fa327-dd41-4737-8f19-2cf5eb1f7cdd.jpg',
		glow: 'var(--mana-colorless)',
	},
	{
		name: 'Lightning Bolt',
		src: 'https://cards.scryfall.io/normal/front/7/7/77c6fa74-5543-42ac-9ead-0e890b188e99.jpg',
		glow: 'var(--mana-red)',
	},
	{
		name: 'Counterspell',
		src: 'https://cards.scryfall.io/normal/front/4/f/4f616706-ec97-4923-bb1e-11a69fbaa1f8.jpg',
		glow: 'var(--mana-blue)',
	},
	{
		name: 'Sol Ring',
		src: 'https://cards.scryfall.io/normal/front/1/4/14dbce79-1fcc-4cc9-bf38-7729e44a411e.jpg',
		glow: 'var(--mana-colorless)',
	},
	{
		name: 'Jace, the Mind Sculptor',
		src: 'https://cards.scryfall.io/normal/front/c/8/c8817585-0d32-4d56-9142-0d29512e86a9.jpg',
		glow: 'var(--mana-blue)',
	},
];

export function CardShowcase() {
	const [ref, inView] = useInView({ threshold: 0.15 });

	return (
		<section ref={ref} className={`${styles.showcase} ${inView ? styles.visible : ''}`}>
			<h2 className={styles.heading}>Explore Iconic Cards</h2>
			<p className={styles.subheading}>
				From the Power Nine to modern staples — every card at your fingertips.
			</p>

			<div className={styles.scrollContainer}>
				{SHOWCASE_CARDS.map((card, i) => (
					<div
						key={card.name}
						className={styles.cardWrapper}
						style={
							{
								'--glow-color': card.glow,
								'--delay': `${i * 0.1}s`,
							} as React.CSSProperties
						}
					>
						<Image
							src={card.src}
							alt={card.name}
							width={488}
							height={680}
							className={styles.cardImage}
							sizes="(max-width: 768px) 60vw, 240px"
						/>
						<span className={styles.cardName}>{card.name}</span>
					</div>
				))}
			</div>
		</section>
	);
}
