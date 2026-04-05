import styles from './VaultDoorBackdrop.module.css';

function octagonPoints(cx: number, cy: number, r: number): string {
	return Array.from({ length: 8 }, (_, i) => {
		const angle = (Math.PI / 4) * i - Math.PI / 8;
		return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
	}).join(' ');
}

export function VaultDoorBackdrop() {
	const c = 230; // center

	return (
		<div className={styles.container}>
			<div className={styles.glow} />
			<svg className={styles.svg} viewBox="0 0 460 460">
				{/* Outer ring */}
				<circle cx={c} cy={c} r={210} className={`${styles.ring} ${styles.ringOuter}`} />

				{/* Middle dashed ring — counter-rotates */}
				<circle cx={c} cy={c} r={170} className={`${styles.ring} ${styles.ringMiddle}`} />

				{/* Inner ring */}
				<circle cx={c} cy={c} r={120} className={`${styles.ring} ${styles.ringInner}`} />

				{/* Outer octagon */}
				<polygon points={octagonPoints(c, c, 195)} className={styles.octagon} />

				{/* Inner octagon — rotates opposite */}
				<polygon
					points={octagonPoints(c, c, 140)}
					className={`${styles.octagon} ${styles.octagonInner}`}
				/>

				{/* Tick marks around outer ring */}
				{Array.from({ length: 24 }, (_, i) => {
					const angle = (Math.PI / 12) * i;
					const x1 = c + 205 * Math.cos(angle);
					const y1 = c + 205 * Math.sin(angle);
					const x2 = c + 215 * Math.cos(angle);
					const y2 = c + 215 * Math.sin(angle);
					return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className={styles.tick} />;
				})}

				{/* Center dot */}
				<circle cx={c} cy={c} r={4} className={styles.centerDot} />
			</svg>
		</div>
	);
}
