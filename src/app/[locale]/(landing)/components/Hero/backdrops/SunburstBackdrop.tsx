import styles from './SunburstBackdrop.module.css';

const C = 300; // center
const MAIN_RAYS = 12;
const ALT_RAYS = 12;

function rayPath(
	cx: number,
	cy: number,
	angle: number,
	innerR: number,
	outerR: number,
	spread: number
): string {
	const a1 = angle - spread;
	const a2 = angle + spread;
	const ix1 = cx + innerR * Math.cos(a1);
	const iy1 = cy + innerR * Math.sin(a1);
	const ix2 = cx + innerR * Math.cos(a2);
	const iy2 = cy + innerR * Math.sin(a2);
	const ox1 = cx + outerR * Math.cos(a1);
	const oy1 = cy + outerR * Math.sin(a1);
	const ox2 = cx + outerR * Math.cos(a2);
	const oy2 = cy + outerR * Math.sin(a2);
	return `M ${ix1} ${iy1} L ${ox1} ${oy1} L ${ox2} ${oy2} L ${ix2} ${iy2} Z`;
}

export function SunburstBackdrop() {
	return (
		<div className={styles.container}>
			<div className={styles.glow} />
			<svg className={styles.svg} viewBox="0 0 600 600">
				{/* Main wide rays */}
				{Array.from({ length: MAIN_RAYS }, (_, i) => {
					const angle = ((Math.PI * 2) / MAIN_RAYS) * i;
					return (
						<path
							key={`main-${i}`}
							d={rayPath(C, C, angle, 50, 280, 0.08)}
							className={styles.ray}
						/>
					);
				})}

				{/* Alternating thin rays */}
				{Array.from({ length: ALT_RAYS }, (_, i) => {
					const angle = ((Math.PI * 2) / ALT_RAYS) * i + Math.PI / ALT_RAYS;
					return (
						<path
							key={`alt-${i}`}
							d={rayPath(C, C, angle, 60, 260, 0.03)}
							className={styles.rayAlt}
						/>
					);
				})}

				{/* Concentric rings */}
				<circle cx={C} cy={C} r={100} className={styles.ring} />
				<circle cx={C} cy={C} r={160} className={`${styles.ring} ${styles.ringDashed}`} />
				<circle cx={C} cy={C} r={220} className={styles.ring} />

				{/* Center ornament */}
				<circle cx={C} cy={C} r={35} className={styles.centerCircle} />
				<rect
					x={C - 8}
					y={C - 8}
					width={16}
					height={16}
					transform={`rotate(45 ${C} ${C})`}
					className={styles.centerDiamond}
				/>
			</svg>
		</div>
	);
}
