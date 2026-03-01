import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import styles from './Hero.module.css';

export function Hero() {
	return (
		<section className={styles.hero}>
			<div className={styles.background}>
				<div className={styles.gradient} />
				<div className={styles.grid} />
			</div>

			<div className={styles.content}>
				<h1 className={styles.title}>
					<span className={styles.titleMain}>MTG Snap</span>
					<span className={styles.titleSub}>Magic Card Search</span>
				</h1>

				<p className={styles.description}>
					Search through every Magic: The Gathering card ever printed. Filter by color, type, set,
					and more. Fast, free, and always up to date.
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
				</div>

				<div className={styles.features}>
					<div className={styles.feature}>
						<div className={styles.featureIcon}>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<circle cx="11" cy="11" r="8" />
								<path d="m21 21-4.35-4.35" />
							</svg>
						</div>
						<div className={styles.featureText}>
							<h3>Instant Search</h3>
							<p>Find cards as you type</p>
						</div>
					</div>

					<div className={styles.feature}>
						<div className={styles.featureIcon}>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
							</svg>
						</div>
						<div className={styles.featureText}>
							<h3>Smart Filters</h3>
							<p>Color, type, and set filters</p>
						</div>
					</div>

					<div className={styles.feature}>
						<div className={styles.featureIcon}>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<rect width="18" height="18" x="3" y="3" rx="2" />
								<path d="M3 9h18" />
								<path d="M3 15h18" />
								<path d="M9 3v18" />
								<path d="M15 3v18" />
							</svg>
						</div>
						<div className={styles.featureText}>
							<h3>Visual Grid</h3>
							<p>Beautiful card images</p>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
