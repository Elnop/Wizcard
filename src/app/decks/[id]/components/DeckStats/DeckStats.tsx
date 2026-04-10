'use client';

import type { DeckStats as DeckStatsType } from '@/lib/deck/utils/deck-stats';
import type { ValidationWarning } from '@/lib/deck/utils/format-rules';
import { ManaCurve } from '../ManaCurve/ManaCurve';
import styles from './DeckStats.module.css';

const COLOR_LABELS: Record<string, string> = {
	W: 'White',
	U: 'Blue',
	B: 'Black',
	R: 'Red',
	G: 'Green',
};

const COLOR_CSS: Record<string, string> = {
	W: 'var(--mana-white, #f9faf4)',
	U: 'var(--mana-blue, #0e68ab)',
	B: 'var(--mana-black, #150b00)',
	R: 'var(--mana-red, #d3202a)',
	G: 'var(--mana-green, #00733e)',
};

type Props = {
	stats: DeckStatsType;
	warnings: ValidationWarning[];
};

export function DeckStats({ stats, warnings }: Props) {
	const colorEntries = Object.entries(stats.colorDistribution).sort((a, b) => b[1] - a[1]);
	const totalColorPips = colorEntries.reduce((sum, [, count]) => sum + count, 0) || 1;

	return (
		<div className={styles.container}>
			<div className={styles.counts}>
				<div className={styles.stat}>
					<span className={styles.statValue}>{stats.totalCards}</span>
					<span className={styles.statLabel}>Total</span>
				</div>
				<div className={styles.stat}>
					<span className={styles.statValue}>{stats.mainboardCount}</span>
					<span className={styles.statLabel}>Main</span>
				</div>
				{stats.sideboardCount > 0 && (
					<div className={styles.stat}>
						<span className={styles.statValue}>{stats.sideboardCount}</span>
						<span className={styles.statLabel}>Side</span>
					</div>
				)}
				{stats.commanderCount > 0 && (
					<div className={styles.stat}>
						<span className={styles.statValue}>{stats.commanderCount}</span>
						<span className={styles.statLabel}>Cmdr</span>
					</div>
				)}
				<div className={styles.stat}>
					<span className={styles.statValue}>{stats.averageCmc.toFixed(1)}</span>
					<span className={styles.statLabel}>Avg CMC</span>
				</div>
			</div>

			<div className={styles.curve}>
				<ManaCurve curve={stats.manaCurve} />
			</div>

			{colorEntries.length > 0 && (
				<div className={styles.colors}>
					<h3 className={styles.sectionTitle}>Colors</h3>
					<div className={styles.colorBar}>
						{colorEntries.map(([color, count]) => (
							<div
								key={color}
								className={styles.colorSegment}
								style={{
									width: `${(count / totalColorPips) * 100}%`,
									background: COLOR_CSS[color] ?? 'var(--text-muted)',
								}}
								title={`${COLOR_LABELS[color] ?? color}: ${count}`}
							/>
						))}
					</div>
					<div className={styles.colorLegend}>
						{colorEntries.map(([color, count]) => (
							<span key={color} className={styles.colorItem}>
								<span
									className={styles.colorDot}
									style={{ background: COLOR_CSS[color] ?? 'var(--text-muted)' }}
								/>
								{COLOR_LABELS[color] ?? color} ({count})
							</span>
						))}
					</div>
				</div>
			)}

			{warnings.length > 0 && (
				<div className={styles.warnings}>
					<h3 className={styles.sectionTitle}>Warnings</h3>
					{warnings.map((w, i) => (
						<div key={i} className={styles.warning}>
							{w.message}
						</div>
					))}
				</div>
			)}
		</div>
	);
}
