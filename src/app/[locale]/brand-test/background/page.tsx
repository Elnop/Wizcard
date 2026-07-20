'use client';

import { useState } from 'react';
import { BACKGROUNDS } from './backgrounds';
import styles from './page.module.css';

/** Les 3 sections de la landing avec le nombre de vignettes de chacune (6/3/4),
 * comme les limites réelles CARD_LIMIT/DECK_LIMIT/PROFILE_LIMIT. */
const SECTIONS = [
	{ title: 'Cards', count: 6 },
	{ title: 'Decks', count: 3 },
	{ title: 'Players', count: 4 },
] as const;

/**
 * Planche de prévisualisation (noindex) des fonds candidats pour /search.
 * Sélecteur en haut → un fond actif en plein écran, avec une maquette de la
 * landing search par-dessus pour juger le motif en situation.
 */
export default function BrandTestBackgroundPage() {
	const [active, setActive] = useState(0);
	const variant = BACKGROUNDS[active];

	return (
		<div className={styles.stage}>
			{/* Couche de fond fixe : ancrée au viewport, ne défile pas avec le contenu.
			    Un calque dédié (plutôt que background-attachment) évite que le
			    shorthand `background` ne réinitialise l'attachement, et se transpose
			    tel quel sur les vraies pages /search. */}
			<div
				className={styles.backdrop}
				style={{ background: variant.background, backgroundSize: variant.backgroundSize }}
				aria-hidden
			/>

			{/* Sélecteur */}
			<nav className={styles.selector} aria-label="Choix du fond">
				{BACKGROUNDS.map((b, i) => (
					<button
						key={b.id}
						type="button"
						onClick={() => setActive(i)}
						className={`${styles.chip} ${i === active ? styles.chipActive : ''}`}
						aria-pressed={i === active}
					>
						{b.label}
					</button>
				))}
			</nav>

			{/* Maquette de la landing search par-dessus le fond */}
			<main className={styles.mock}>
				<div className={styles.switcher}>
					<span className={styles.tab}>Cards</span>
					<span className={styles.tab}>Decks</span>
					<span className={styles.tab}>Players</span>
				</div>

				<div className={styles.searchbar}>
					<span className={styles.searchIcon} aria-hidden>
						⌕
					</span>
					<span className={styles.searchPlaceholder}>Search cards, decks, and players…</span>
				</div>

				{SECTIONS.map(({ title, count }) => (
					<section key={title} className={styles.section}>
						<div className={styles.sectionHeader}>
							<h2 className={styles.sectionTitle}>{title}</h2>
							<span className={styles.seeMore}>See more →</span>
						</div>
						<div className={styles.grid}>
							{Array.from({ length: count }).map((_, i) => (
								<div key={i} className={styles.cardSkeleton} />
							))}
						</div>
					</section>
				))}
			</main>

			{/* Étiquette flottante : nom + intention du fond courant */}
			<footer className={styles.caption}>
				<strong className={styles.captionLabel}>{variant.label}</strong>
				<span className={styles.captionNote}>{variant.note}</span>
			</footer>
		</div>
	);
}
