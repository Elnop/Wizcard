'use client';

import styles from './ManaCurve.module.css';

type Props = {
	curve: Record<number, number>;
};

export function ManaCurve({ curve }: Props) {
	const maxCmc = Math.max(7, ...Object.keys(curve).map(Number));
	const entries: Array<{ cmc: number; count: number }> = [];
	for (let i = 0; i <= maxCmc; i++) {
		entries.push({ cmc: i, count: curve[i] ?? 0 });
	}
	// Group 7+ into "7+"
	const grouped = entries.filter((e) => e.cmc <= 6);
	const sevenPlus = entries.filter((e) => e.cmc >= 7).reduce((sum, e) => sum + e.count, 0);
	grouped.push({ cmc: 7, count: sevenPlus });

	const maxCount = Math.max(1, ...grouped.map((e) => e.count));

	return (
		<div className={styles.container}>
			<div className={styles.chart}>
				{grouped.map((entry, i) => {
					const heightPct = `${(entry.count / maxCount) * 100}%`;
					return (
						<div key={entry.cmc} className={styles.column}>
							<span className={styles.count}>{entry.count || ''}</span>
							<div
								className={styles.bar}
								style={
									{
										height: heightPct,
										'--bar-height': heightPct,
										'--col-index': i,
									} as React.CSSProperties
								}
							/>
							<span className={styles.label}>{entry.cmc === 7 ? '7+' : entry.cmc}</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}
