'use client';

import Image from 'next/image';
import { isScryfallImageUrl, scryfallImageLoader } from '@/lib/scryfall/utils/scryfallImageLoader';
import { COLLECTION_CARDS, COLLECTION_TARGET } from '@/app/[locale]/(landing)/data/demoContent';
import { seg } from '@/app/[locale]/(landing)/utils/seg';
import styles from './CollectionDemo.module.css';

// Récit de la section : des cartes PHYSIQUES (pile 3D à gauche) deviennent une
// COLLECTION NUMÉRIQUE (grille à droite), reliées par une flèche qui se trace.
// Beats : pile 0→0.35, flèche 0.35→0.55, grille 0.5→0.85, compteur 0.6→1.
const STACK_SIZE = 5;

export function CollectionDemo({ progress }: { progress: number }) {
	const stack = seg(progress, 0, 0.35);
	const arrow = seg(progress, 0.35, 0.55);
	const grid = seg(progress, 0.5, 0.85);
	// Se termine à 0.9 (pas 1) : le total doit être atteint AVANT la fin de course,
	// sinon le compteur est encore en train de monter quand la section se dépingle.
	const count = Math.round(seg(progress, 0.55, 0.9) * COLLECTION_TARGET);
	const gridRevealed = Math.round(grid * COLLECTION_CARDS.length);

	return (
		<div className={styles.wrap}>
			<div className={styles.scene}>
				{/* Pile de cartes physiques */}
				<div className={styles.stack}>
					{COLLECTION_CARDS.slice(0, STACK_SIZE).map((card, i) => {
						// Chaque carte tombe sur la pile l'une après l'autre.
						const local = Math.min(1, Math.max(0, stack * STACK_SIZE - i));
						return (
							<div
								key={i}
								className={styles.stackCard}
								style={{
									opacity: local,
									transform: `translate(${i * 7}px, ${i * -9 - (1 - local) * 40}px) rotate(${
										(i - 2) * 2.5
									}deg)`,
									zIndex: i,
								}}
							>
								<Image
									src={card.src}
									alt={card.name}
									width={122}
									height={170}
									loader={scryfallImageLoader}
									unoptimized={isScryfallImageUrl(card.src)}
									sizes="120px"
								/>
							</div>
						);
					})}
				</div>

				{/* Flèche : physique → numérique */}
				<div className={styles.arrow} style={{ opacity: arrow }}>
					<span className={styles.arrowLine} style={{ transform: `scaleX(${arrow})` }} />
					<span className={styles.arrowHead} style={{ opacity: arrow > 0.85 ? 1 : 0 }} />
				</div>

				{/* Collection numérique */}
				<div className={styles.grid}>
					{COLLECTION_CARDS.map((card, i) => (
						<div
							key={i}
							className={styles.cell}
							style={{
								opacity: i < gridRevealed ? 1 : 0.06,
								transform: `scale(${i < gridRevealed ? 1 : 0.9})`,
							}}
						>
							<Image
								src={card.src}
								alt={card.name}
								width={122}
								height={170}
								loader={scryfallImageLoader}
								unoptimized={isScryfallImageUrl(card.src)}
								sizes="70px"
							/>
						</div>
					))}
				</div>
			</div>

			<div className={styles.counter}>{count.toLocaleString()}</div>
		</div>
	);
}
