'use client';

import type { DeckStats as DeckStatsType } from '@/lib/deck/utils/deck-stats';
import type { ValidationWarning } from '@/lib/deck/utils/format-rules';
import { ManaCurve } from '../ManaCurve/ManaCurve';
import { ColorBalance } from '../ColorBalance/ColorBalance';
import { TypeBar } from '../TypeBar/TypeBar';
import styles from './DeckStats.module.css';

type Props = {
	stats: DeckStatsType;
	warnings: ValidationWarning[];
};

export function DeckStats({ stats, warnings }: Props) {
	const kpis = [
		{ label: 'Cards', value: stats.totalCards },
		{ label: 'Avg CMC', value: stats.averageCmc.toFixed(2) },
		{ label: 'Lands', value: stats.landCount },
		{ label: 'Creatures', value: stats.typeDistribution.Creature },
	];

	return (
		<div className={styles.panel}>
			<div className={styles.kpis}>
				{kpis.map((k) => (
					<div key={k.label} className={styles.kpi}>
						<span className={styles.kpiValue}>{k.value}</span>
						<span className={styles.kpiLabel}>{k.label}</span>
					</div>
				))}
			</div>

			<hr className={styles.hair} />

			<section className={styles.section}>
				<h3 className={styles.sectionTitle}>Mana Curve</h3>
				<ManaCurve curve={stats.manaCurve} />
			</section>

			<hr className={styles.hair} />

			<section className={styles.section}>
				<h3 className={styles.sectionTitle}>Color Balance — Cost vs Production</h3>
				<ColorBalance cost={stats.colorsCost} production={stats.colorsProduction} />
			</section>

			<hr className={styles.hair} />

			<section className={styles.section}>
				<h3 className={styles.sectionTitle}>Types</h3>
				<TypeBar types={stats.typeDistribution} />
			</section>

			{warnings.length > 0 && (
				<>
					<hr className={styles.hair} />
					<section className={styles.section}>
						<h3 className={styles.sectionTitle}>Warnings</h3>
						{warnings.map((w, i) => (
							<div key={i} className={styles.warning}>
								{w.message}
							</div>
						))}
					</section>
				</>
			)}
		</div>
	);
}
