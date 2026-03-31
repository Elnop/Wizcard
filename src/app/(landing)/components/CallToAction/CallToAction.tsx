import Link from 'next/link';
import { Button } from '@/components/Button/Button';
import styles from './CallToAction.module.css';

export function CallToAction() {
	return (
		<section className={styles.cta}>
			<div className={styles.glow} />
			<div className={styles.content}>
				<h2 className={styles.title}>Ready to explore?</h2>
				<p className={styles.description}>
					Search through over 80,000 unique Magic: The Gathering cards. Build and manage your
					collection with ease.
				</p>
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
		</section>
	);
}
