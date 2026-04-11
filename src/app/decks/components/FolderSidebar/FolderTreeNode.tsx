'use client';

import { useState, useRef, useEffect } from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { CaretDownIcon, CaretRightIcon, FolderIcon, FolderOpenIcon } from '@phosphor-icons/react';
import type { FolderNode } from '@/lib/deck/utils/folder-tree';
import styles from './FolderTreeNode.module.css';

type Props = {
	node: FolderNode;
	depth: number;
	activeFolderId: string | null | 'none';
	onSelect: (id: string) => void;
	onRename: (folderId: string, name: string) => void;
	onDelete: (folderId: string) => void;
	deckCountByFolder: Record<string, number>;
};

export function FolderTreeNode({
	node,
	depth,
	activeFolderId,
	onSelect,
	onRename,
	onDelete,
	deckCountByFolder,
}: Props) {
	const [expanded, setExpanded] = useState(true);
	const [renaming, setRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState(node.name);
	const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
	const renameInputRef = useRef<HTMLInputElement>(null);

	const { setNodeRef: setDropRef, isOver } = useDroppable({
		id: node.id,
		data: { type: 'folder', folderId: node.id },
	});

	const {
		setNodeRef: setDragRef,
		attributes,
		listeners,
		isDragging,
	} = useDraggable({
		id: `folder-drag-${node.id}`,
		data: { type: 'folder-drag', folderId: node.id },
	});

	const setNodeRef = (el: HTMLElement | null) => {
		setDropRef(el);
		setDragRef(el);
	};

	useEffect(() => {
		if (renaming) renameInputRef.current?.select();
	}, [renaming]);

	const handleContextMenu = (e: React.MouseEvent) => {
		e.preventDefault();
		setContextMenu({ x: e.clientX, y: e.clientY });
	};

	const handleRenameSubmit = () => {
		const trimmed = renameValue.trim();
		if (trimmed && trimmed !== node.name) {
			onRename(node.id, trimmed);
		}
		setRenaming(false);
	};

	const isActive = activeFolderId === node.id;

	return (
		<div>
			<div
				ref={setNodeRef}
				{...attributes}
				{...listeners}
				role="button"
				tabIndex={0}
				className={`${styles.node} ${isActive ? styles.active : ''} ${isOver ? styles.dropOver : ''} ${isDragging ? styles.dragging : ''}`}
				style={{ paddingLeft: `${0.75 + Math.min(depth, 4) * 1}rem` }}
				onClick={() => !renaming && onSelect(node.id)}
				onKeyDown={(e) => {
					if (e.key === 'Enter') onSelect(node.id);
				}}
				onContextMenu={handleContextMenu}
			>
				{node.children.length > 0 ? (
					<button
						className={styles.chevron}
						onClick={(e) => {
							e.stopPropagation();
							setExpanded((v) => !v);
						}}
						aria-label={expanded ? 'Collapse' : 'Expand'}
					>
						{expanded ? <CaretDownIcon size={10} /> : <CaretRightIcon size={10} />}
					</button>
				) : (
					<span className={styles.chevronPlaceholder} />
				)}

				{expanded && node.children.length > 0 ? (
					<FolderOpenIcon size={16} className={styles.folderIcon} />
				) : (
					<FolderIcon size={16} className={styles.folderIcon} />
				)}

				{renaming ? (
					<input
						ref={renameInputRef}
						className={styles.renameInput}
						value={renameValue}
						onChange={(e) => setRenameValue(e.target.value)}
						onBlur={handleRenameSubmit}
						onKeyDown={(e) => {
							if (e.key === 'Enter') handleRenameSubmit();
							if (e.key === 'Escape') setRenaming(false);
						}}
						onPointerDown={(e) => e.stopPropagation()}
						onClick={(e) => e.stopPropagation()}
					/>
				) : (
					<span className={styles.label} title={node.name}>
						{node.name}
					</span>
				)}

				{deckCountByFolder[node.id] !== undefined && deckCountByFolder[node.id] > 0 && (
					<span className={styles.count}>{deckCountByFolder[node.id]}</span>
				)}
			</div>

			{contextMenu && (
				<FolderContextMenu
					x={contextMenu.x}
					y={contextMenu.y}
					onClose={() => setContextMenu(null)}
					onRename={() => {
						setContextMenu(null);
						setRenameValue(node.name);
						setRenaming(true);
					}}
					onDelete={() => {
						setContextMenu(null);
						onDelete(node.id);
					}}
				/>
			)}

			{expanded && node.children.length > 0 && (
				<div>
					{node.children.map((child) => (
						<FolderTreeNode
							key={child.id}
							node={child}
							depth={depth + 1}
							activeFolderId={activeFolderId}
							onSelect={onSelect}
							onRename={onRename}
							onDelete={onDelete}
							deckCountByFolder={deckCountByFolder}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function FolderContextMenu({
	x,
	y,
	onClose,
	onRename,
	onDelete,
}: {
	x: number;
	y: number;
	onClose: () => void;
	onRename: () => void;
	onDelete: () => void;
}) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handleClick = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) onClose();
		};
		const handleKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};
		document.addEventListener('mousedown', handleClick);
		document.addEventListener('keydown', handleKey);
		return () => {
			document.removeEventListener('mousedown', handleClick);
			document.removeEventListener('keydown', handleKey);
		};
	}, [onClose]);

	return (
		<div ref={ref} className={styles.contextMenu} style={{ top: y, left: x }}>
			<button className={styles.contextItem} onClick={onRename}>
				Renommer
			</button>
			<button className={`${styles.contextItem} ${styles.contextItemDanger}`} onClick={onDelete}>
				Supprimer
			</button>
		</div>
	);
}
