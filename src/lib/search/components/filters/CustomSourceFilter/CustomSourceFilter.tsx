'use client';

import type { MpcSource } from '@/lib/mpc/types';
import styles from './CustomSourceFilter.module.css';

interface CustomSourceFilterProps {
	sources: MpcSource[];
	value: string | null;
	onChange: (sourceId: string | null) => void;
}

export function CustomSourceFilter({ sources, value, onChange }: CustomSourceFilterProps) {
	return (
		<div className={styles.container}>
			<span className={styles.label}>Créateur</span>
			<div className={styles.options}>
				<button
					type="button"
					className={`${styles.option} ${value === null ? styles.selected : ''}`}
					onClick={() => onChange(null)}
					aria-pressed={value === null}
				>
					Tous
				</button>
				{sources.map((source) => (
					<button
						key={source.id}
						type="button"
						className={`${styles.option} ${value === source.id ? styles.selected : ''}`}
						onClick={() => onChange(source.id)}
						aria-pressed={value === source.id}
					>
						{source.name}
					</button>
				))}
			</div>
		</div>
	);
}
