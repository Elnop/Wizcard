import styles from './ManaPentagonBackdrop.module.css';

const C = 240; // center
const R = 180; // radius of pentagon
const ICON_SIZE = 36;

const MANA = [
	{ id: 'W', color: 'var(--mana-white)' },
	{ id: 'U', color: 'var(--mana-blue)' },
	{ id: 'B', color: 'var(--mana-black)' },
	{ id: 'R', color: 'var(--mana-red)' },
	{ id: 'G', color: 'var(--mana-green)' },
];

function nodePos(index: number): [number, number] {
	// Start from top (-90°)
	const angle = ((Math.PI * 2) / 5) * index - Math.PI / 2;
	return [C + R * Math.cos(angle), C + R * Math.sin(angle)];
}

export function ManaPentagonBackdrop() {
	const positions = MANA.map((_, i) => nodePos(i));

	return (
		<div className={styles.container}>
			<div className={styles.glow} />
			<svg className={styles.svg} viewBox="0 0 480 480">
				<g className={styles.rotateGroup}>
					{/* Pentagon edges */}
					{positions.map(([x1, y1], i) => {
						const [x2, y2] = positions[(i + 1) % 5];
						return (
							<line key={`edge-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} className={styles.line} />
						);
					})}

					{/* Pentagram (star) inner lines */}
					{positions.map(([x1, y1], i) => {
						const [x2, y2] = positions[(i + 2) % 5];
						return (
							<line key={`star-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} className={styles.starLine} />
						);
					})}

					{/* Spokes from center */}
					{positions.map(([x, y], i) => (
						<line key={`spoke-${i}`} x1={C} y1={C} x2={x} y2={y} className={styles.spoke} />
					))}

					{/* Mana nodes — outer ring + Scryfall SVG icon */}
					{MANA.map((mana, i) => {
						const [x, y] = positions[i];
						return (
							<g key={mana.id}>
								<circle cx={x} cy={y} r={26} className={styles.manaNode} stroke={mana.color} />
								{}
								<image
									href={`https://svgs.scryfall.io/card-symbols/${mana.id}.svg`}
									x={x - ICON_SIZE / 2}
									y={y - ICON_SIZE / 2}
									width={ICON_SIZE}
									height={ICON_SIZE}
									className={styles.manaIcon}
								/>
							</g>
						);
					})}
				</g>

				{/* Static center */}
				<circle cx={C} cy={C} r={20} className={styles.centerRing} />
				<circle cx={C} cy={C} r={3} className={styles.centerDot} />
			</svg>
		</div>
	);
}
