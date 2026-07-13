'use client';

import { useTranslations } from 'next-intl';
import styles from './TypeBar.module.css';

// Ordre d'affichage + clé de traduction + couleur de segment. `key` est le type
// MTG (donnée) ; `labelKey` pointe vers le libellé traduit.
const TYPE_ORDER = [
	{ key: 'Creature', labelKey: 'typeCreatures', css: 'var(--brass)' },
	{ key: 'Instant', labelKey: 'typeInstants', css: '#5a6b8a' },
	{ key: 'Sorcery', labelKey: 'typeSorceries', css: '#6b7a9a' },
	{ key: 'Enchantment', labelKey: 'typeEnchantments', css: '#8a6b9a' },
	{ key: 'Artifact', labelKey: 'typeArtifacts', css: '#9a8a6b' },
	{ key: 'Planeswalker', labelKey: 'typePlaneswalkers', css: '#8a5a6b' },
	{ key: 'Land', labelKey: 'typeLands', css: 'var(--surface-hover)' },
	{ key: 'Other', labelKey: 'typeOther', css: 'var(--border)' },
] as const;

type Props = {
	types: Record<string, number>;
};

export function TypeBar({ types }: Props) {
	const t = useTranslations('decks');
	const entries = TYPE_ORDER.map((e) => ({ ...e, count: types[e.key] ?? 0 })).filter(
		(e) => e.count > 0
	);
	const total = entries.reduce((s, e) => s + e.count, 0);
	if (total === 0) return null;

	return (
		<div className={styles.container}>
			<div className={styles.bar}>
				{entries.map((e) => (
					<span
						key={e.key}
						className={styles.segment}
						style={{ width: `${(e.count / total) * 100}%`, background: e.css }}
						title={`${t(e.labelKey)}: ${e.count}`}
					/>
				))}
			</div>
			<ul className={styles.legend}>
				{entries.map((e) => (
					<li key={e.key} className={styles.item}>
						<span className={styles.dot} style={{ background: e.css }} />
						{t(e.labelKey)} ({e.count})
					</li>
				))}
			</ul>
		</div>
	);
}
