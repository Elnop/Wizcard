'use client';

import { useTranslations } from 'next-intl';
import { ColorIdentityIcons } from '@/lib/scryfall/components/ColorIdentityIcons';
import styles from './ColorBalance.module.css';

const COLOR_ORDER = ['W', 'U', 'B', 'R', 'G'] as const;
const COLOR_CSS: Record<string, string> = {
	W: 'var(--mana-white)',
	U: 'var(--mana-blue)',
	B: 'var(--mana-black)',
	R: 'var(--mana-red)',
	G: 'var(--mana-green)',
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
}: {
	label: string;
	values: (k: string) => number;
	keys: readonly string[];
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
							title={`${COLOR_LABELS[k] ?? k}: ${Math.round(w)}%`}
						/>
					);
				})}
			</div>
		</div>
	);
}

export function ColorBalance({ cost, production }: Props) {
	const t = useTranslations('decks');
	const costPct = pct(cost, COLOR_ORDER);
	// Production comparée sur les mêmes 5 couleurs (C exclu de la comparaison pips).
	const prodPct = pct(production, COLOR_ORDER);

	const hasCost = COLOR_ORDER.some((k) => (cost[k] ?? 0) > 0);
	const hasProd = COLOR_ORDER.some((k) => (production[k] ?? 0) > 0);
	if (!hasCost && !hasProd) return null;

	const notes = COLOR_ORDER.filter((k) => (cost[k] ?? 0) > 0 || (production[k] ?? 0) > 0)
		.map((k) => ({ k, gap: Math.round(costPct(k) - prodPct(k)) }))
		.filter((n) => Math.abs(n.gap) >= NOTE_THRESHOLD);

	return (
		<div className={styles.container}>
			<StackedBar label={t('colorBalanceCost')} values={costPct} keys={COLOR_ORDER} />
			<StackedBar label={t('colorBalanceProduction')} values={prodPct} keys={COLOR_ORDER} />
			{notes.length > 0 && (
				<ul className={styles.notes}>
					{notes.map(({ k }) => (
						<li key={k} className={styles.note}>
							<ColorIdentityIcons colors={[k]} size={14} />
							{t('colorBalanceNote', {
								color: COLOR_LABELS[k] ?? k,
								costPct: Math.round(costPct(k)),
								prodPct: Math.round(prodPct(k)),
							})}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
