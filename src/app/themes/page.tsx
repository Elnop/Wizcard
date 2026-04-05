import Image from 'next/image';
import Link from 'next/link';
import { SHOWCASE_SECTIONS } from '@/themes/_shared/mockData';
import styles from './page.module.css';

// Take first 4 cards from showcase sections for the preview
const PREVIEW_CARDS = SHOWCASE_SECTIONS.flatMap((s) => s.cards).slice(0, 4);

const themes = [
	{
		id: 'vault',
		name: "The Collector's Vault",
		subtitle: 'Art Deco + Glassmorphism',
		description:
			'Geometric gold frames, chevron patterns, glass-frosted overlays. Premium luxury vault aesthetic.',
		accent: '#C9A84C',
		bg: '#0B0C10',
	},
	{
		id: 'library',
		name: "The Planeswalker's Library",
		subtitle: 'Dark Academia + Sacred Geometry',
		description:
			'Warm scholarly palette, paper grain textures, elegant serifs. Ancient library ambiance.',
		accent: '#8C1127',
		bg: '#1E1E24',
	},
	{
		id: 'forge',
		name: 'The Mana Forge',
		subtitle: 'Arcane Mystique + Glass',
		description: 'Deep violet/indigo, mana-colored auras, pulsing glows. Mystical forge energy.',
		accent: '#7C3AED',
		bg: '#0A0A14',
	},
];

export default function ThemesIndex() {
	return (
		<div className={styles.page}>
			<header className={styles.header}>
				<h1 className={styles.title}>Theme Showcase</h1>
				<p className={styles.subtitle}>
					Explore 3 visual directions for Wizcard. Each theme reimagines the full component library
					and landing page.
				</p>
			</header>

			<div className={styles.grid}>
				{themes.map((theme) => (
					<div
						key={theme.id}
						className={styles.card}
						style={
							{
								'--theme-accent': theme.accent,
								'--theme-bg': theme.bg,
							} as React.CSSProperties
						}
					>
						<div className={styles.cardPreview}>
							{PREVIEW_CARDS.map((card) => (
								<Image
									key={card.name}
									src={card.src}
									alt={card.name}
									width={488}
									height={680}
									className={styles.previewCard}
									sizes="80px"
								/>
							))}
						</div>
						<div className={styles.cardContent}>
							<h2 className={styles.cardTitle}>{theme.name}</h2>
							<p className={styles.cardSubtitle}>{theme.subtitle}</p>
							<p className={styles.cardDescription}>{theme.description}</p>
							<div className={styles.cardLinks}>
								<Link href={`/themes/${theme.id}/homepage`} className={styles.link}>
									Homepage
								</Link>
							</div>
						</div>
					</div>
				))}
			</div>

			<p className={styles.cosmosHint}>
				Component fixtures are available in React Cosmos (port 5000).
			</p>
		</div>
	);
}
