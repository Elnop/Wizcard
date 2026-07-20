import styles from './ConstellationBackdrop.module.css';

// Star positions (x, y) on a 500x500 grid
const STARS = [
	[250, 120],
	[180, 200],
	[320, 190],
	[140, 300],
	[360, 290],
	[200, 380],
	[300, 370],
	[250, 250],
	[100, 180],
	[400, 200],
	[150, 400],
	[350, 390],
	[250, 50],
	[80, 260],
	[420, 270],
	[220, 450],
	[280, 440],
];

// Connections between stars (indices)
const LINES = [
	[0, 1],
	[0, 2],
	[1, 3],
	[2, 4],
	[3, 5],
	[4, 6],
	[5, 6],
	[1, 7],
	[2, 7],
	[0, 12],
	[8, 1],
	[9, 2],
	[3, 10],
	[4, 11],
	[8, 13],
	[9, 14],
	[10, 15],
	[11, 16],
	[7, 5],
	[7, 6],
];

export function ConstellationBackdrop() {
	return (
		<div className={styles.container}>
			<div className={styles.glow} />
			<svg className={styles.svg} viewBox="0 0 500 500">
				{LINES.map(([a, b], i) => (
					<line
						key={i}
						x1={STARS[a][0]}
						y1={STARS[a][1]}
						x2={STARS[b][0]}
						y2={STARS[b][1]}
						className={styles.line}
					/>
				))}
				{STARS.map(([x, y], i) => (
					<circle
						key={i}
						cx={x}
						cy={y}
						r={i === 7 ? 4 : 2}
						className={styles.star}
						style={{ animationDelay: `${i * 0.2}s` }}
					/>
				))}
			</svg>
		</div>
	);
}
