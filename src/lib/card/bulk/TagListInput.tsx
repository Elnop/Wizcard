'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import styles from './BulkEditModal.module.css';

type Props = {
	id: string;
	label: string;
	tags: string[];
	onChange: (tags: string[]) => void;
};

/** Chip input: Enter or "," adds a tag, Backspace on empty input removes the last. */
export function TagListInput({ id, label, tags, onChange }: Props) {
	const t = useTranslations('bulk');
	const [input, setInput] = useState('');

	function commit() {
		const tag = input.trim().replace(/,$/, '');
		if (tag && !tags.includes(tag)) onChange([...tags, tag]);
		setInput('');
	}

	function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
		if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
			e.preventDefault();
			commit();
		} else if (e.key === 'Backspace' && !input && tags.length > 0) {
			onChange(tags.slice(0, -1));
		}
	}

	return (
		<div className={styles.field}>
			<label className={styles.label} htmlFor={id}>
				{label}
			</label>
			<div className={styles.tagsField}>
				{tags.map((tag) => (
					<span key={tag} className={styles.tag}>
						{tag}
						<button
							type="button"
							className={styles.tagRemove}
							onClick={() => onChange(tags.filter((x) => x !== tag))}
							aria-label={t('removeTag', { tag })}
						>
							×
						</button>
					</span>
				))}
				<input
					id={id}
					type="text"
					className={styles.tagInput}
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={handleKeyDown}
					onBlur={commit}
					placeholder={tags.length === 0 ? t('addTags') : ''}
				/>
			</div>
		</div>
	);
}
