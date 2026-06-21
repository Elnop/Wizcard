import type { ReactNode } from 'react';
import styles from './CompletionRing.module.css';

export interface CompletionRingProps {
	/** Progress percentage, 0–100. */
	percent: number;
	/** Outer diameter in px. */
	size?: number;
	/** Stroke thickness in px. */
	stroke?: number;
	/** Ring color theme: gold completion or jade owned or shimmering foil. */
	variant?: 'gold' | 'jade' | 'foil';
	/** Content rendered centered inside the ring (icon, value…). */
	children?: ReactNode;
	className?: string;
	/** Accessible label describing what the ring measures. */
	'aria-label'?: string;
}

const VARIANT_COLOR: Record<NonNullable<CompletionRingProps['variant']>, string> = {
	gold: 'var(--primary)',
	jade: 'var(--success)',
	foil: 'url(#completionRingFoil)',
};

export function CompletionRing({
	percent,
	size = 56,
	stroke = 5,
	variant = 'gold',
	children,
	className,
	'aria-label': ariaLabel,
}: CompletionRingProps) {
	const clamped = Math.max(0, Math.min(100, percent));
	const radius = (size - stroke) / 2;
	const circumference = 2 * Math.PI * radius;
	const offset = circumference * (1 - clamped / 100);
	const center = size / 2;

	return (
		<div
			className={[styles.ring, className].filter(Boolean).join(' ')}
			style={{ width: size, height: size }}
			role="img"
			aria-label={ariaLabel ?? `${Math.round(clamped)}%`}
		>
			<svg width={size} height={size} className={styles.svg} aria-hidden="true">
				<defs>
					<linearGradient id="completionRingFoil" x1="0%" y1="0%" x2="100%" y2="100%">
						<stop offset="0%" stopColor="var(--brass)" />
						<stop offset="50%" stopColor="#f3e6b0" />
						<stop offset="100%" stopColor="var(--primary)" />
					</linearGradient>
				</defs>
				<circle
					cx={center}
					cy={center}
					r={radius}
					fill="none"
					stroke="var(--border)"
					strokeWidth={stroke}
				/>
				<circle
					cx={center}
					cy={center}
					r={radius}
					fill="none"
					stroke={VARIANT_COLOR[variant]}
					strokeWidth={stroke}
					strokeLinecap="round"
					strokeDasharray={circumference}
					strokeDashoffset={offset}
					transform={`rotate(-90 ${center} ${center})`}
					className={styles.progress}
				/>
			</svg>
			{children != null && <div className={styles.center}>{children}</div>}
		</div>
	);
}
