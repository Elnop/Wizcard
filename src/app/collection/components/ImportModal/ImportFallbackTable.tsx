'use client';

import type { PendingCard } from '@/lib/import/types';
import styles from './ImportModal.module.css';

interface ImportFallbackTableProps {
	rows: PendingCard[];
}

export function ImportFallbackTable({ rows }: ImportFallbackTableProps) {
	// Group by name+set+num to show a unique-card list with count
	const grouped = new Map<string, { card: PendingCard; count: number }>();
	for (const card of rows) {
		const key = `${card.name}|${card.set}|${card.collectorNumber}`;
		const existing = grouped.get(key);
		if (existing) {
			existing.count++;
		} else {
			grouped.set(key, { card, count: 1 });
		}
	}

	return (
		<div className={styles.tableContainer}>
			<table className={styles.previewTable}>
				<thead>
					<tr>
						<th>Qté</th>
						<th>Nom</th>
						<th>Set</th>
						<th>Collector #</th>
					</tr>
				</thead>
				<tbody>
					{Array.from(grouped.values()).map(({ card, count }, i) => (
						<tr key={i}>
							<td>{count}</td>
							<td>{card.name}</td>
							<td>{card.set?.toUpperCase() || '—'}</td>
							<td>{card.collectorNumber || '—'}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
