'use client';

import { useTranslations } from 'next-intl';
import { ColorIdentityIcons } from '@/lib/scryfall/components/ColorIdentityIcons';
import styles from './ColorBalance.module.css';

const COLOR_ORDER = ['W', 'U', 'B', 'R', 'G'] as const;
// Segments affichés par barre : le coût n'a jamais de "any color" ; les deux ont C.
const COST_KEYS = ['W', 'U', 'B', 'R', 'G', 'C'] as const;
const PROD_KEYS = ['W', 'U', 'B', 'R', 'G', 'C', 'ANY'] as const;
const COLOR_CSS: Record<string, string> = {
	W: 'var(--mana-white)',
	U: 'var(--mana-blue)',
	B: 'var(--mana-black)',
	R: 'var(--mana-red)',
	G: 'var(--mana-green)',
	C: 'var(--mana-colorless)',
	ANY: 'linear-gradient(90deg, var(--mana-white), var(--mana-blue), var(--mana-black), var(--mana-red), var(--mana-green))',
};
const COLOR_LABELS: Record<string, string> = {
	W: 'White',
	U: 'Blue',
	B: 'Black',
	R: 'Red',
	G: 'Green',
};

// Écart (points de %) au-delà duquel on affiche une note informative.
const NOTE_THRESHOLD = 12;

type Props = {
	cost: Record<string, number>;
	production: Record<string, number>;
};

function pct(map: Record<string, number>, keys: readonly string[]) {
	const total = keys.reduce((s, k) => s + (map[k] ?? 0), 0) || 1;
	return (k: string) => ((map[k] ?? 0) / total) * 100;
}

function StackedBar({
	label,
	values,
	keys,
	segLabels,
}: {
	label: string;
	values: (k: string) => number;
	keys: readonly string[];
	segLabels: Record<string, string>;
}) {
	return (
		<div className={styles.row}>
			<span className={styles.rowLabel}>{label}</span>
			<div className={styles.bar}>
				{keys.map((k) => {
					const w = values(k);
					if (w <= 0) return null;
					return (
						<span
							key={k}
							className={styles.segment}
							style={{ width: `${w}%`, background: COLOR_CSS[k] }}
							title={`${segLabels[k] ?? k}: ${Math.round(w)}%`}
						/>
					);
				})}
			</div>
		</div>
	);
}

export function ColorBalance({ cost, production }: Props) {
	const t = useTranslations('decks');

	// Libellés de segment : WUBRG statiques, C/ANY traduits.
	const segLabels: Record<string, string> = {
		...COLOR_LABELS,
		C: t('colorBalanceColorless'),
		ANY: t('colorBalanceAny'),
	};

	// % d'affichage : recalibrés sur l'ensemble des segments de chaque barre
	// (le coût inclut C ; la production inclut C + ANY).
	const costPctBar = pct(cost, COST_KEYS);
	const prodPctBar = pct(production, PROD_KEYS);

	// % des notes : base WUBRG seule, pour une comparaison coût/prod honnête
	// (dénominateurs identiques, indépendants de C/ANY).
	const costPctWubrg = pct(cost, COLOR_ORDER);
	const prodPctWubrg = pct(production, COLOR_ORDER);

	const hasCost = COST_KEYS.some((k) => (cost[k] ?? 0) > 0);
	const hasProd = PROD_KEYS.some((k) => (production[k] ?? 0) > 0);
	if (!hasCost && !hasProd) return null;

	const notes = COLOR_ORDER.filter((k) => (cost[k] ?? 0) > 0 || (production[k] ?? 0) > 0)
		.map((k) => ({ k, gap: Math.round(costPctWubrg(k) - prodPctWubrg(k)) }))
		.filter((n) => Math.abs(n.gap) >= NOTE_THRESHOLD);

	return (
		<div className={styles.container}>
			<StackedBar
				label={t('colorBalanceCost')}
				values={costPctBar}
				keys={COST_KEYS}
				segLabels={segLabels}
			/>
			<StackedBar
				label={t('colorBalanceProduction')}
				values={prodPctBar}
				keys={PROD_KEYS}
				segLabels={segLabels}
			/>
			{notes.length > 0 && (
				<ul className={styles.notes}>
					{notes.map(({ k }) => (
						<li key={k} className={styles.note}>
							<ColorIdentityIcons colors={[k]} size={14} />
							{t('colorBalanceNote', {
								color: COLOR_LABELS[k] ?? k,
								costPct: Math.round(costPctWubrg(k)),
								prodPct: Math.round(prodPctWubrg(k)),
							})}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
