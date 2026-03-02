'use client';

import { useRouter } from 'next/navigation';
import type { Card } from '@/types/card';
import { CardImage } from '@/components/cards/CardImage';
import styles from './CollectionGrid.module.css';

export interface CollectionGridProps {
	entries: Card[];
	onDecrement: (cardId: string) => void;
}

export function CollectionGrid({ entries, onDecrement }: CollectionGridProps) {
	const router = useRouter();

	return (
		<div className={styles.grid}>
			{entries.map((entry) => (
				<div key={entry.id} className={styles.item}>
					<div className={styles.imageWrapper}>
						<CardImage
							card={entry}
							size="normal"
							onClick={() => router.push(`/card/${entry.id}`)}
						/>
						{(entry.quantity ?? 0) > 1 && <span className={styles.badge}>x{entry.quantity}</span>}
						<button
							type="button"
							className={styles.removeButton}
							onClick={(e) => {
								e.stopPropagation();
								onDecrement(entry.id);
							}}
							aria-label={`Remove one ${entry.name}`}
						>
							<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
								<path
									d="M2 4h10M5 4V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1M6 6.5v3M8 6.5v3M3 4l.5 7a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1L11 4"
									stroke="currentColor"
									strokeWidth="1.2"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							</svg>
						</button>
					</div>
					<p className={styles.cardName}>{entry.name}</p>
				</div>
			))}
		</div>
	);
}
