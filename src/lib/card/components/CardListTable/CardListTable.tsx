import type { ScryfallSortDir } from '@/lib/scryfall/types/sort';
import type { CardListTableProps } from './CardListTable.types';
import styles from './CardListTable.module.css';

function SortIcon({ dir }: { dir: ScryfallSortDir }) {
	if (dir === 'desc') {
		return (
			<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
				<path
					d="M8 3v10M4 9l4 4 4-4"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		);
	}
	return (
		<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<path
				d="M8 13V3M4 7l4-4 4 4"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function CardListTable({
	cards,
	columns,
	onCardClick,
	sortOrder,
	sortDir,
	onSortChange,
}: CardListTableProps) {
	function handleHeaderClick(key: string) {
		if (!onSortChange) return;
		if (sortOrder === key) {
			onSortChange(key, sortDir === 'asc' ? 'desc' : 'asc');
		} else {
			onSortChange(key, 'asc');
		}
	}

	return (
		<div className={styles.tableContainer}>
			<table className={styles.table}>
				<thead>
					<tr>
						{columns.map((col) => (
							<th
								key={col.key}
								onClick={col.sortKey ? () => handleHeaderClick(col.sortKey!) : undefined}
								className={col.sortKey ? styles.thSortable : undefined}
								aria-sort={
									col.sortKey && sortOrder === col.sortKey
										? sortDir === 'desc'
											? 'descending'
											: 'ascending'
										: undefined
								}
							>
								{col.label}
								{col.sortKey && sortOrder === col.sortKey && <SortIcon dir={sortDir ?? 'asc'} />}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{cards.map((c) => (
						<tr
							key={c.id}
							className={onCardClick ? styles.clickableRow : undefined}
							onClick={onCardClick ? () => onCardClick(c) : undefined}
						>
							{columns.map((col) => (
								<td key={col.key}>
									{col.render
										? col.render(c)
										: String((c as unknown as Record<string, unknown>)[col.key] ?? '')}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
