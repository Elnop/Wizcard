'use client';

import { useState, useEffect, useRef } from 'react';
import type { DeckMeta } from '@/types/decks';
import { Button } from '@/components/Button/Button';
import styles from './DeckHeader.module.css';

type Props = {
	deck: DeckMeta;
	onUpdate?: (updates: Partial<Pick<DeckMeta, 'name' | 'format' | 'description'>>) => void;
	onAssignAllFromCollection?: () => void;
	onAddAllToCollection?: () => void;
	onImportList?: () => void;
	onGeneratePdf?: () => void;
	onExportText?: () => void;
	/** Bulk-selection mode toggle (owner view only). */
	selectMode?: boolean;
	onToggleSelectMode?: () => void;
	/** Read-only (public) view: hides editing, keeps export/copy actions. */
	readOnly?: boolean;
};

export function DeckHeader({
	deck,
	onUpdate,
	onAssignAllFromCollection,
	onAddAllToCollection,
	onImportList,
	onGeneratePdf,
	onExportText,
	selectMode = false,
	onToggleSelectMode,
	readOnly = false,
}: Props) {
	const [isEditing, setIsEditing] = useState(false);
	const [name, setName] = useState(deck.name);
	const [description, setDescription] = useState(deck.description ?? '');
	const [menuOpen, setMenuOpen] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!menuOpen) return;
		const close = () => setMenuOpen(false);
		document.addEventListener('click', close);
		return () => document.removeEventListener('click', close);
	}, [menuOpen]);

	function handleSave() {
		if (!name.trim()) return;
		onUpdate?.({
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

	const hasMoreActions = Boolean(onAssignAllFromCollection || onAddAllToCollection || onImportList);

	return (
		<div className={styles.header}>
			{deck.format && <span className={styles.kicker}>{deck.format}</span>}
			<div className={styles.titleRow}>
				<span className={styles.diamond} aria-hidden="true">
					◆
				</span>
				<h1 className={styles.name}>{deck.name}</h1>
			</div>
			<div className={styles.rule} aria-hidden="true">
				<span className={styles.ruleDiamond}>◆</span>
			</div>
			{deck.description && <p className={styles.description}>{deck.description}</p>}

			<div className={styles.actions}>
				{!readOnly && (
					<button type="button" className={styles.actionBtn} onClick={() => setIsEditing(true)}>
						<EditIcon />
						<span>Edit</span>
					</button>
				)}
				{onExportText && (
					<button type="button" className={styles.actionBtn} onClick={() => onExportText()}>
						<ExportIcon />
						<span>Export</span>
					</button>
				)}
				{onGeneratePdf && (
					<button type="button" className={styles.actionBtn} onClick={() => onGeneratePdf()}>
						<PdfIcon />
						<span>Generate PDF</span>
					</button>
				)}
				{onToggleSelectMode && (
					<button
						type="button"
						className={`${styles.actionBtn} ${selectMode ? styles.actionBtnActive : ''}`}
						onClick={() => onToggleSelectMode()}
						aria-pressed={selectMode}
					>
						<SelectIcon />
						<span>{selectMode ? 'Done' : 'Select'}</span>
					</button>
				)}
				{hasMoreActions && (
					<div className={styles.menuWrapper} ref={menuRef} onClick={(e) => e.stopPropagation()}>
						<button
							type="button"
							className={styles.actionBtn}
							onClick={() => setMenuOpen((v) => !v)}
							aria-haspopup="menu"
							aria-expanded={menuOpen}
						>
							<MoreIcon />
							<span>More</span>
						</button>
						{menuOpen && (
							<div className={styles.dropdown} role="menu">
								{onAssignAllFromCollection && (
									<button
										type="button"
										className={styles.dropdownItem}
										role="menuitem"
										onClick={() => {
											setMenuOpen(false);
											onAssignAllFromCollection();
										}}
									>
										⊕ Assign all from collection
									</button>
								)}
								{onAddAllToCollection && (
									<button
										type="button"
										className={styles.dropdownItem}
										role="menuitem"
										onClick={() => {
											setMenuOpen(false);
											onAddAllToCollection();
										}}
									>
										⊕ Ajouter tout à la collection
									</button>
								)}
								{onImportList && (
									<button
										type="button"
										className={styles.dropdownItem}
										role="menuitem"
										onClick={() => {
											setMenuOpen(false);
											onImportList();
										}}
									>
										⊕ Import list
									</button>
								)}
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

function EditIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<path
				d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"
				stroke="currentColor"
				strokeWidth="1.8"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function ExportIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<path
				d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
				stroke="currentColor"
				strokeWidth="1.8"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function PdfIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<path
				d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z"
				stroke="currentColor"
				strokeWidth="1.8"
				strokeLinejoin="round"
			/>
			<path d="M14 3v6h6" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
		</svg>
	);
}

function SelectIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.8" />
			<path
				d="M8 12l3 3 5-6"
				stroke="currentColor"
				strokeWidth="1.8"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function MoreIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<circle cx="12" cy="5" r="1.6" />
			<circle cx="12" cy="12" r="1.6" />
			<circle cx="12" cy="19" r="1.6" />
		</svg>
	);
}
