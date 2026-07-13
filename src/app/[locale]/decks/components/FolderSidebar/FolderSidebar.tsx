'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useDroppable } from '@dnd-kit/core';
import { BooksIcon, FolderSimpleMinusIcon, PlusIcon } from '@phosphor-icons/react';
import type { FolderMeta } from '@/types/decks';
import type { DeckMeta } from '@/types/decks';
import { buildFolderTree } from '@/lib/deck/utils/folder-tree';
import { FolderTreeNode } from './FolderTreeNode';
import styles from './FolderSidebar.module.css';

type Props = {
	folders: FolderMeta[];
	decks: DeckMeta[];
	activeFolderId: string | null | 'none';
	onFolderSelect: (id: string | null | 'none') => void;
	onCreateFolder: (name: string, parentId: string | null) => void;
	onRenameFolder: (folderId: string, name: string) => void;
	onDeleteFolder: (folderId: string) => void;
};

export function FolderSidebar({
	folders,
	decks,
	activeFolderId,
	onFolderSelect,
	onCreateFolder,
	onRenameFolder,
	onDeleteFolder,
}: Props) {
	const t = useTranslations('decks');
	const [addingFolder, setAddingFolder] = useState(false);
	const [newFolderName, setNewFolderName] = useState('');
	const newFolderInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (addingFolder) newFolderInputRef.current?.focus();
	}, [addingFolder]);

	const handleNewFolderSubmit = () => {
		const trimmed = newFolderName.trim();
		if (trimmed) {
			onCreateFolder(trimmed, null);
		}
		setNewFolderName('');
		setAddingFolder(false);
	};

	const tree = buildFolderTree(folders);

	const { setNodeRef: setRootDropRef, isOver: isOverRoot } = useDroppable({
		id: 'folder-root',
		data: { type: 'folder-root' },
	});

	// Compute deck count per folder (direct children only)
	const deckCountByFolder: Record<string, number> = {};
	for (const deck of decks) {
		if (deck.folderId) {
			deckCountByFolder[deck.folderId] = (deckCountByFolder[deck.folderId] ?? 0) + 1;
		}
	}

	const unfiledCount = decks.filter((d) => d.folderId === null).length;

	return (
		<nav className={styles.sidebar} aria-label={t('folders')}>
			<div className={styles.section}>
				<p className={styles.sectionLabel}>{t('library')}</p>
				<button
					ref={setRootDropRef}
					className={`${styles.item} ${activeFolderId === null ? styles.active : ''} ${isOverRoot ? styles.dropOver : ''}`}
					onClick={() => onFolderSelect(null)}
				>
					<BooksIcon className={styles.icon} size={16} />
					<span className={styles.label}>{t('myDecks')}</span>
					<span className={styles.count}>{decks.length}</span>
				</button>
				<button
					className={`${styles.item} ${activeFolderId === 'none' ? styles.active : ''}`}
					onClick={() => onFolderSelect('none')}
				>
					<FolderSimpleMinusIcon className={styles.icon} size={16} />
					<span className={styles.label}>{t('noFolder')}</span>
					{unfiledCount > 0 && <span className={styles.count}>{unfiledCount}</span>}
				</button>
			</div>

			{(tree.length > 0 || addingFolder) && <div className={styles.divider} />}

			{tree.length > 0 && (
				<div className={styles.treeSection}>
					<p className={styles.sectionLabel}>{t('folders')}</p>
					{tree.map((node) => (
						<FolderTreeNode
							key={node.id}
							node={node}
							depth={0}
							activeFolderId={activeFolderId}
							onSelect={onFolderSelect}
							onRename={onRenameFolder}
							onDelete={onDeleteFolder}
							deckCountByFolder={deckCountByFolder}
						/>
					))}
				</div>
			)}

			<div className={styles.divider} />

			{addingFolder ? (
				<input
					ref={newFolderInputRef}
					className={styles.newFolderInput}
					placeholder={t('folderName')}
					value={newFolderName}
					onChange={(e) => setNewFolderName(e.target.value)}
					onBlur={handleNewFolderSubmit}
					onKeyDown={(e) => {
						if (e.key === 'Enter') handleNewFolderSubmit();
						if (e.key === 'Escape') {
							setNewFolderName('');
							setAddingFolder(false);
						}
					}}
				/>
			) : (
				<button className={styles.addFolderBtn} onClick={() => setAddingFolder(true)}>
					<PlusIcon size={12} />
					{t('newFolder')}
				</button>
			)}
		</nav>
	);
}
