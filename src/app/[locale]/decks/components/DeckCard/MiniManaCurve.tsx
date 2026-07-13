import styles from './MiniManaCurve.module.css';

type Props = {
	curve: Record<number, number>;
};

const BUCKETS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

export function MiniManaCurve({ curve }: Props) {
	const maxCount = Math.max(...BUCKETS.map((b) => curve[b] ?? 0), 1);

	return (
		<div className={styles.container}>
			<div className={styles.bars}>
				{BUCKETS.map((bucket, i) => {
					const count = curve[bucket] ?? 0;
					const heightPct = `${(count / maxCount) * 100}%`;
					return (
						<div key={bucket} className={styles.column}>
							<div className={styles.barTrack}>
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
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
