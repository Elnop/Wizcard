'use client';

import styles from './TypeBar.module.css';

// Ordre d'affichage + couleur de segment (teintes DA, distinctes des couleurs mana).
const TYPE_ORDER: Array<{ key: string; label: string; css: string }> = [
	{ key: 'Creature', label: 'Creatures', css: 'var(--brass)' },
	{ key: 'Instant', label: 'Instants', css: '#5a6b8a' },
	{ key: 'Sorcery', label: 'Sorceries', css: '#6b7a9a' },
	{ key: 'Enchantment', label: 'Enchantments', css: '#8a6b9a' },
	{ key: 'Artifact', label: 'Artifacts', css: '#9a8a6b' },
	{ key: 'Planeswalker', label: 'Planeswalkers', css: '#8a5a6b' },
	{ key: 'Land', label: 'Lands', css: 'var(--surface-hover)' },
	{ key: 'Other', label: 'Other', css: 'var(--border)' },
];

type Props = {
	types: Record<string, number>;
};

export function TypeBar({ types }: Props) {
	const entries = TYPE_ORDER.map((t) => ({ ...t, count: types[t.key] ?? 0 })).filter(
		(t) => t.count > 0
	);
	const total = entries.reduce((s, t) => s + t.count, 0);
	if (total === 0) return null;

	return (
		<div className={styles.container}>
			<div className={styles.bar}>
				{entries.map((t) => (
					<span
						key={t.key}
						className={styles.segment}
						style={{ width: `${(t.count / total) * 100}%`, background: t.css }}
						title={`${t.label}: ${t.count}`}
					/>
				))}
			</div>
			<ul className={styles.legend}>
				{entries.map((t) => (
					<li key={t.key} className={styles.item}>
						<span className={styles.dot} style={{ background: t.css }} />
						{t.label} ({t.count})
					</li>
				))}
			</ul>
		</div>
	);
}
