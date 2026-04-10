import type { ScryfallSortDir } from '@/lib/scryfall/types/sort';
import type { CardListSection } from '@/lib/card/components/CardList/CardList.types';
import type { CardListTableProps } from './CardListTable.types';
import { Spinner } from '@/components/Spinner/Spinner';
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
	sections,
	isLoading = false,
	onCardClick,
	sortOrder,
	sortDir,
	onSortChange,
	collapsedSections,
	onSectionToggle,
}: CardListTableProps) {
	function handleHeaderClick(key: string) {
		if (!onSortChange) return;
		if (sortOrder === key) {
			onSortChange(key, sortDir === 'asc' ? 'desc' : 'asc');
		} else {
			onSortChange(key, 'asc');
		}
	}

	if (isLoading) {
		return (
			<div className={styles.loadingWrapper}>
				<Spinner size="md" />
			</div>
		);
	}

	const isCollapsible = !!onSectionToggle;

	function renderCardRows(cardItems: typeof cards) {
		return cardItems.map((c) => (
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
		));
	}

	function renderSectionRows(section: CardListSection, depth: number, parentKey: string) {
		const sectionKey = parentKey ? `${parentKey}::${section.label}` : section.label;
		const collapsed = collapsedSections?.has(sectionKey) ?? false;

		const labelMatch = section.label.match(/^(.+?)\s*(\(\d+\))$/);
		const labelName = labelMatch?.[1] ?? section.label;
		const labelCount = labelMatch?.[2] ?? '';

		const rows: React.ReactNode[] = [];

		rows.push(
			<tr key={`section-${sectionKey}`} className={styles.sectionRow} data-depth={depth}>
				<td colSpan={columns.length} className={styles.sectionCell}>
					{isCollapsible ? (
						<button
							type="button"
							className={styles.sectionButton}
							style={{ paddingLeft: `${depth * 16 + 12}px` }}
							onClick={() => onSectionToggle(sectionKey)}
						>
							<span className={`${styles.chevron} ${collapsed ? styles.chevronCollapsed : ''}`}>
								▾
							</span>
							{labelName}
							{labelCount && <span className={styles.sectionCount}> {labelCount}</span>}
						</button>
					) : (
						<span className={styles.sectionLabel} style={{ paddingLeft: `${depth * 16 + 12}px` }}>
							{labelName}
							{labelCount && <span className={styles.sectionCount}> {labelCount}</span>}
						</span>
					)}
				</td>
			</tr>
		);

		if (!collapsed) {
			if (section.children && section.children.length > 0) {
				for (const child of section.children) {
					rows.push(...renderSectionRows(child, depth + 1, sectionKey));
				}
			} else {
				rows.push(...renderCardRows(section.cards));
			}
		}

		return rows;
	}

	const bodyRows =
		sections && sections.length > 0
			? sections.flatMap((section) => renderSectionRows(section, 0, ''))
			: renderCardRows(cards);

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
				<tbody>{bodyRows}</tbody>
			</table>
		</div>
	);
}
