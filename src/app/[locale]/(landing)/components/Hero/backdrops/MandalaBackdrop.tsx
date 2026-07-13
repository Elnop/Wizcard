import styles from './MandalaBackdrop.module.css';

const C = 260; // center
const RAYS = 16;
const PETALS = 8;

function petalPath(index: number, innerR: number, outerR: number, spread: number): string {
	const angle = ((Math.PI * 2) / PETALS) * index;
	const a1 = angle - spread;
	const a2 = angle + spread;

	const ix = C + innerR * Math.cos(angle);
	const iy = C + innerR * Math.sin(angle);
	const ox1 = C + outerR * Math.cos(a1);
	const oy1 = C + outerR * Math.sin(a1);
	const ox2 = C + outerR * Math.cos(a2);
	const oy2 = C + outerR * Math.sin(a2);

	return `M ${ix} ${iy} Q ${ox1} ${oy1} ${C + outerR * Math.cos(angle)} ${C + outerR * Math.sin(angle)} Q ${ox2} ${oy2} ${ix} ${iy}`;
}

export function MandalaBackdrop() {
	return (
		<div className={styles.container}>
			<div className={styles.glow} />
			<svg className={styles.svg} viewBox="0 0 520 520">
				<g className={styles.rotateGroup}>
					{/* Rays from center */}
					{Array.from({ length: RAYS }, (_, i) => {
						const angle = ((Math.PI * 2) / RAYS) * i;
						return (
							<line
								key={`ray-${i}`}
								x1={C + 40 * Math.cos(angle)}
								y1={C + 40 * Math.sin(angle)}
								x2={C + 240 * Math.cos(angle)}
								y2={C + 240 * Math.sin(angle)}
								className={styles.ray}
							/>
						);
					})}

					{/* Concentric arcs */}
					<circle cx={C} cy={C} r={80} className={styles.arc} />
					<circle cx={C} cy={C} r={130} className={`${styles.arc} ${styles.arcThick}`} />
					<circle cx={C} cy={C} r={180} className={styles.arc} />
					<circle cx={C} cy={C} r={220} className={`${styles.arc} ${styles.arcThick}`} />

					{/* Petals — inner ring */}
					{Array.from({ length: PETALS }, (_, i) => (
						<path
							key={`petal-inner-${i}`}
							d={petalPath(i, 50, 120, 0.18)}
							className={styles.petal}
						/>
					))}

					{/* Petals — outer ring (rotated) */}
					{Array.from({ length: PETALS }, (_, i) => (
						<path
							key={`petal-outer-${i}`}
							d={petalPath(i + 0.5, 140, 210, 0.14)}
							className={styles.petal}
						/>
					))}
				</g>

				{/* Static center */}
				<circle cx={C} cy={C} r={30} className={styles.centerRing} />
				<rect
					x={C - 6}
					y={C - 6}
					width={12}
					height={12}
					transform={`rotate(45 ${C} ${C})`}
					className={styles.centerDiamond}
				/>
			</svg>
		</div>
	);
}
