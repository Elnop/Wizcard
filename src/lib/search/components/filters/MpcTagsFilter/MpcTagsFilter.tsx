interface MpcTagsFilterProps {
	availableTags: string[];
	value: string[];
	onChange: (value: string[]) => void;
}

export function MpcTagsFilter({ availableTags, value, onChange }: MpcTagsFilterProps) {
	if (availableTags.length === 0) return null;

	const toggle = (tag: string) => {
		onChange(value.includes(tag) ? value.filter((t) => t !== tag) : [...value, tag]);
	};

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
				Tags MPC
			</div>
			<div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
				{availableTags.map((tag) => (
					<button
						key={tag}
						type="button"
						onClick={() => toggle(tag)}
						style={{
							fontSize: 11,
							padding: '2px 8px',
							borderRadius: 999,
							border: '1px solid var(--color-border, #e5e7eb)',
							background: value.includes(tag)
								? 'var(--color-accent, #6366f1)'
								: 'var(--color-surface-2, #f3f4f6)',
							color: value.includes(tag) ? '#fff' : 'var(--color-text, #111827)',
							cursor: 'pointer',
						}}
					>
						{tag}
					</button>
				))}
			</div>
		</div>
	);
}
