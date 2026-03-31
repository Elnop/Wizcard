'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/Button/Button';
import { useInView } from '@/hooks/useInView';
import styles from './Hero.module.css';

const HERO_CARDS = [
	{
		name: 'Black Lotus',
		src: 'https://cards.scryfall.io/normal/front/b/d/bd8fa327-dd41-4737-8f19-2cf5eb1f7cdd.jpg',
	},
	{
		name: 'Jace, the Mind Sculptor',
		src: 'https://cards.scryfall.io/normal/front/c/8/c8817585-0d32-4d56-9142-0d29512e86a9.jpg',
	},
	{
		name: 'Lightning Bolt',
		src: 'https://cards.scryfall.io/normal/front/7/7/77c6fa74-5543-42ac-9ead-0e890b188e99.jpg',
	},
];

export function Hero() {
	const [ref, inView] = useInView({ threshold: 0.1 });

	return (
		<section ref={ref} className={`${styles.hero} ${inView ? styles.visible : ''}`}>
			<div className={styles.background}>
				<div className={styles.gradient} />
				<div className={styles.grid} />
			</div>

			<div className={styles.heroGrid}>
				<div className={styles.textColumn}>
					<h1 className={styles.title}>
						<span className={styles.titleMain}>Wizcard</span>
						<span className={styles.titleSub}>Your complete Magic: The Gathering companion</span>
					</h1>

					<p className={styles.description}>
						Search, collect, and manage every Magic card ever printed. Powerful filters, offline
						sync, and bulk import — all in one place.
					</p>

					<div className={styles.cta}>
						<Link href="/search">
							<Button size="lg">
								Start Searching
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="20"
									height="20"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<path d="M5 12h14" />
									<path d="m12 5 7 7-7 7" />
								</svg>
							</Button>
						</Link>
						<Link href="/collection">
							<Button variant="ghost" size="lg">
								My Collection
							</Button>
						</Link>
					</div>
				</div>

				<div className={styles.cardFan}>
					{HERO_CARDS.map((card, i) => (
						<div key={card.name} className={styles[`fanCard${i}`]}>
							<Image
								src={card.src}
								alt={card.name}
								width={488}
								height={680}
								className={styles.cardImage}
								priority={i === 1}
								sizes="(max-width: 768px) 200px, 280px"
							/>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
