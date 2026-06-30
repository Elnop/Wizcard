'use client';

import { useMemo } from 'react';
import { useDeckContext } from '@/lib/deck/context/DeckContext';
import type { Card } from '@/types/cards';
import styles from './DeckBadge.module.css';

type Props = {
	/** All copies of one stack (same oracle_id, possibly different prints/decks). */
	cards: Card[];
};

/**
 * Overlay badge shown on a collection card when at least one of its copies is
 * assigned to a deck. The number is the count of copies used in decks; hovering
 * reveals which decks (with per-deck copy counts).
 */
export function DeckBadge({ cards }: Props) {
	const { decks } = useDeckContext();

	const { assignedCount, breakdown } = useMemo(() => {
		const nameById = new Map(decks.map((d) => [d.id, d.name]));
		const counts = new Map<string, number>();
		let total = 0;
		for (const card of cards) {
			const deckId = card.entry.deckId;
			if (deckId == null) continue;
			total += 1;
			const name = nameById.get(deckId) ?? 'Deleted deck';
			counts.set(name, (counts.get(name) ?? 0) + 1);
		}
		const lines = Array.from(counts.entries())
			.sort((a, b) => a[0].localeCompare(b[0]))
			.map(([name, count]) => (count > 1 ? `${name} ×${count}` : name));
		return { assignedCount: total, breakdown: lines };
	}, [cards, decks]);

	if (assignedCount === 0) return null;

	return (
		<span className={styles.badge}>
			<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
				<path
					d="M3 2h7l3 3v9H3V2z"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinejoin="round"
				/>
			</svg>
			{assignedCount}
			<span className={styles.tooltip}>
				<span className={styles.tooltipHeader}>Decks</span>
				{breakdown.map((line) => (
					<span key={line} className={styles.tooltipItem}>
						{line}
					</span>
				))}
			</span>
		</span>
	);
}
