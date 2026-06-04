import type { CardType } from '@/lib/mpc/types';

const OPTIONS: { value: CardType | 'all'; label: string }[] = [
	{ value: 'all', label: 'Tous' },
	{ value: 'card', label: 'Cartes' },
	{ value: 'token', label: 'Tokens' },
	{ value: 'cardback', label: 'Cardbacks' },
];

interface CardTypeFilterProps {
	value: CardType | 'all';
	onChange: (value: CardType | 'all') => void;
}

export function CardTypeFilter({ value, onChange }: CardTypeFilterProps) {
	return (
		<div>
			<div
				style={{
					fontSize: 12,
					fontWeight: 600,
					marginBottom: 6,
					color: 'var(--color-text-muted, #6b7280)',
				}}
			>
				Type de carte
			</div>
			<select
				value={value}
				onChange={(e) => onChange(e.target.value as CardType | 'all')}
				style={{
					width: '100%',
					padding: '6px 8px',
					borderRadius: 6,
					border: '1px solid var(--color-border, #e5e7eb)',
					background: 'var(--color-surface, #fff)',
					fontSize: 13,
				}}
			>
				{OPTIONS.map((opt) => (
					<option key={opt.value} value={opt.value}>
						{opt.label}
					</option>
				))}
			</select>
		</div>
	);
}
