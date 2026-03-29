'use client';

import type { ParsedImportRow } from '@/lib/import/utils/types';
import styles from './ImportModal.module.css';

interface ImportFallbackTableProps {
	rows: ParsedImportRow[];
}

export function ImportFallbackTable({ rows }: ImportFallbackTableProps) {
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
					{rows.map((row, i) => (
						<tr key={i}>
							<td>{row.quantity}</td>
							<td>{row.name}</td>
							<td>{row.set?.toUpperCase() || '—'}</td>
							<td>{row.collectorNumber || '—'}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
