'use client';

import { useInView } from '@/hooks/useInView';
import styles from './Features.module.css';

const FEATURES = [
	{
		title: 'Instant Search',
		description:
			'Find any card as you type. Scryfall-powered autocomplete with real-time results across every set ever printed.',
		icon: (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="28"
				height="28"
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
		),
	},
	{
		title: 'Advanced Filters',
		description:
			'Filter by color identity, card type, set, mana cost, rarity, and oracle text. Combine filters freely.',
		icon: (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="28"
				height="28"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
			</svg>
		),
	},
	{
		title: 'Collection Management',
		description:
			'Track conditions, foil status, language, purchase price, and more for every card in your collection.',
		icon: (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="28"
				height="28"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<path d="M12.89 1.45 8 4.69 3.11 1.45a2 2 0 0 0-3.11 1.66v16.78a2 2 0 0 0 1.11 1.79L8 24l6.89-2.32a2 2 0 0 0 1.11-1.79V3.11a2 2 0 0 0-3.11-1.66Z" />
				<path d="M16 12h6" />
				<path d="M16 8h6" />
				<path d="M16 16h6" />
			</svg>
		),
	},
	{
		title: 'Import from Anywhere',
		description:
			'Import your collection from Moxfield or MTG Arena export format. Bulk import hundreds of cards at once.',
		icon: (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="28"
				height="28"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
				<polyline points="7 10 12 15 17 10" />
				<line x1="12" x2="12" y1="15" y2="3" />
			</svg>
		),
	},
	{
		title: 'Cloud Sync',
		description:
			'Sign in to sync your collection across devices. Works offline and syncs automatically when you reconnect.',
		icon: (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="28"
				height="28"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
				<path d="m12 13-3 3 3 3" />
				<path d="M9 16h6" />
			</svg>
		),
	},
];

export function Features() {
	const [ref, inView] = useInView({ threshold: 0.1 });

	return (
		<section ref={ref} className={`${styles.features} ${inView ? styles.visible : ''}`}>
			<h2 className={styles.heading}>Everything You Need</h2>
			<p className={styles.subheading}>
				Powerful tools for searching, collecting, and managing your Magic cards.
			</p>

			<div className={styles.grid}>
				{FEATURES.map((feature, i) => (
					<div
						key={feature.title}
						className={styles.card}
						style={{ '--delay': `${i * 0.08}s` } as React.CSSProperties}
					>
						<div className={styles.icon}>{feature.icon}</div>
						<h3 className={styles.cardTitle}>{feature.title}</h3>
						<p className={styles.cardDescription}>{feature.description}</p>
					</div>
				))}
			</div>
		</section>
	);
}
