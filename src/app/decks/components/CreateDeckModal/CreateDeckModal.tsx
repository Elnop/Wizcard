'use client';

import { useState } from 'react';
import { Modal } from '@/components/Modal/Modal';
import { Button } from '@/components/Button/Button';
import type { DeckFormat, FolderMeta } from '@/types/decks';
import styles from './CreateDeckModal.module.css';

const FORMATS: { value: DeckFormat | ''; label: string }[] = [
	{ value: '', label: 'No format' },
	{ value: 'standard', label: 'Standard' },
	{ value: 'modern', label: 'Modern' },
	{ value: 'pioneer', label: 'Pioneer' },
	{ value: 'legacy', label: 'Legacy' },
	{ value: 'vintage', label: 'Vintage' },
	{ value: 'commander', label: 'Commander' },
	{ value: 'pauper', label: 'Pauper' },
	{ value: 'brawl', label: 'Brawl' },
	{ value: 'oathbreaker', label: 'Oathbreaker' },
	{ value: 'draft', label: 'Draft' },
	{ value: 'limited', label: 'Limited' },
];

type Props = {
	folders?: FolderMeta[];
	defaultFolderId?: string | null;
	onCreate: (
		name: string,
		format: DeckFormat | null,
		description: string | null,
		folderId: string | null
	) => void;
	onClose: () => void;
};

export function CreateDeckModal({
	folders = [],
	defaultFolderId = null,
	onCreate,
	onClose,
}: Props) {
	const [name, setName] = useState('');
	const [format, setFormat] = useState<DeckFormat | ''>('');
	const [description, setDescription] = useState('');
	const [folderId, setFolderId] = useState<string>(defaultFolderId ?? '');

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!name.trim()) return;
		onCreate(name.trim(), format || null, description.trim() || null, folderId || null);
	}

	return (
		<Modal onClose={onClose} className={styles.dialog}>
			<form onSubmit={handleSubmit} className={styles.form}>
				<h2 className={styles.title}>New Deck</h2>

				<label className={styles.label}>
					Name
					<input
						type="text"
						className={styles.input}
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="My Deck"
						autoFocus
					/>
				</label>

				<label className={styles.label}>
					Format
					<select
						className={styles.input}
						value={format}
						onChange={(e) => setFormat(e.target.value as DeckFormat | '')}
					>
						{FORMATS.map((f) => (
							<option key={f.value} value={f.value} className={styles.option}>
								{f.label}
							</option>
						))}
					</select>
				</label>

				{folders.length > 0 && (
					<label className={styles.label}>
						Folder
						<select
							className={styles.input}
							value={folderId}
							onChange={(e) => setFolderId(e.target.value)}
						>
							<option value="">Aucun dossier</option>
							{folders.map((f) => (
								<option key={f.id} value={f.id} className={styles.option}>
									{f.name}
								</option>
							))}
						</select>
					</label>
				)}

				<label className={styles.label}>
					Description
					<textarea
						className={styles.textarea}
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						placeholder="Deck strategy, notes..."
						rows={3}
					/>
				</label>

				<div className={styles.actions}>
					<Button variant="ghost" type="button" onClick={onClose}>
						Cancel
					</Button>
					<Button type="submit" disabled={!name.trim()}>
						Create
					</Button>
				</div>
			</form>
		</Modal>
	);
}
