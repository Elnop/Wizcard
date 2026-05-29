'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { CardImage } from '@/lib/card/components/CardImage/CardImage';
import styles from './CardLightbox.module.css';

interface Props {
	card: ScryfallCard;
	onClose: () => void;
	isFoil?: boolean;
	foilType?: 'foil' | 'etched';
}

export function CardLightbox({ card, onClose, isFoil = false, foilType = 'foil' }: Props) {
	const [effectsEnabled, setEffectsEnabled] = useState(true);

	if (typeof document === 'undefined') return null;

	const content = (
		<div className={styles.lightbox} onClick={onClose}>
			{/* Effects toggle — top left */}
			<div
				className={styles.effectsToggle}
				onClick={(e) => {
					e.stopPropagation();
					setEffectsEnabled((v) => !v);
				}}
				role="button"
				tabIndex={0}
				aria-pressed={effectsEnabled}
				aria-label={effectsEnabled ? 'Désactiver les effets' : 'Activer les effets'}
				onKeyDown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.stopPropagation();
						setEffectsEnabled((v) => !v);
					}
				}}
			>
				<span className={styles.toggleLabel}>Effets</span>
				<span className={styles.toggleTrack} data-active={effectsEnabled}>
					<span className={styles.toggleThumb} />
				</span>
			</div>

			{/* Close button — top right */}
			<button type="button" onClick={onClose} aria-label="Fermer" className={styles.closeBtn}>
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<path
						d="M2 2l12 12M14 2L2 14"
						stroke="currentColor"
						strokeWidth="1.8"
						strokeLinecap="round"
					/>
				</svg>
			</button>

			<div className={styles.lightboxCard} onClick={(e) => e.stopPropagation()}>
				<CardImage
					card={card}
					size="large"
					priority
					disableTilt={!effectsEnabled}
					isFoil={effectsEnabled ? isFoil : false}
					foilType={foilType}
				/>
			</div>
		</div>
	);

	return createPortal(content, document.body);
}
