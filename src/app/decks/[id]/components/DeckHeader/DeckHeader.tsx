'use client';

import { useState } from 'react';
import type { DeckMeta } from '@/types/decks';
import { Button } from '@/components/Button/Button';
import styles from './DeckHeader.module.css';

type Props = {
	deck: DeckMeta;
	onUpdate: (updates: Partial<Pick<DeckMeta, 'name' | 'format' | 'description'>>) => void;
};

export function DeckHeader({ deck, onUpdate }: Props) {
	const [isEditing, setIsEditing] = useState(false);
	const [name, setName] = useState(deck.name);
	const [description, setDescription] = useState(deck.description ?? '');

	function handleSave() {
		if (!name.trim()) return;
		onUpdate({
			name: name.trim(),
			description: description.trim() || null,
		});
		setIsEditing(false);
	}

	function handleCancel() {
		setName(deck.name);
		setDescription(deck.description ?? '');
		setIsEditing(false);
	}

	if (isEditing) {
		return (
			<div className={styles.header}>
				<input
					type="text"
					className={styles.nameInput}
					value={name}
					onChange={(e) => setName(e.target.value)}
					autoFocus
				/>
				<textarea
					className={styles.descInput}
					value={description}
					onChange={(e) => setDescription(e.target.value)}
					placeholder="Description..."
					rows={2}
				/>
				<div className={styles.editActions}>
					<Button variant="ghost" size="sm" onClick={handleCancel}>
						Cancel
					</Button>
					<Button size="sm" onClick={handleSave} disabled={!name.trim()}>
						Save
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className={styles.header}>
			<div className={styles.titleRow}>
				<h1 className={styles.name}>{deck.name}</h1>
				{deck.format && <span className={styles.format}>{deck.format}</span>}
				<Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
					Edit
				</Button>
			</div>
			{deck.description && <p className={styles.description}>{deck.description}</p>}
		</div>
	);
}
