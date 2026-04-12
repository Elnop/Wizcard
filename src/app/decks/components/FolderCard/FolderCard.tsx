'use client';

import { useDraggable, useDroppable } from '@dnd-kit/core';
import { FolderIcon } from '@phosphor-icons/react';
import type { FolderMeta, DeckMeta } from '@/types/decks';
import type { DeckSummary } from '../../useDeckSummaries';
import styles from './FolderCard.module.css';

type Props = {
	folder: FolderMeta;
	decks: DeckMeta[];
	childFolderCount: number;
	summaryMap: Record<string, DeckSummary | undefined>;
	onClick: () => void;
};

export function FolderCard({ folder, decks, childFolderCount, summaryMap, onClick }: Props) {
	const { setNodeRef: setDropRef, isOver } = useDroppable({
		id: `folder-card-${folder.id}`,
		data: { type: 'folder', folderId: folder.id },
	});

	const {
		setNodeRef: setDragRef,
		attributes,
		listeners,
		isDragging,
	} = useDraggable({
		id: `folder-drag-${folder.id}`,
		data: { type: 'folder-drag', folderId: folder.id },
	});

	const setNodeRef = (el: HTMLElement | null) => {
		setDropRef(el);
		setDragRef(el);
	};

	// Collect up to 4 art crops from direct decks
	const artCrops = decks
		.map((d) => summaryMap[d.id]?.artCropUrl)
		.filter((url): url is string => !!url)
		.slice(0, 4);

	return (
		<div
			ref={setNodeRef}
			{...attributes}
			{...listeners}
			role="button"
			tabIndex={0}
			className={`${styles.card} ${isOver ? styles.dropOver : ''} ${isDragging ? styles.dragging : ''}`}
			onClick={() => !isDragging && onClick()}
			onKeyDown={(e) => {
				if (e.key === 'Enter') onClick();
			}}
		>
			{/* ── Header ── */}
			<div className={styles.header}>
				<div className={styles.headerLeft}>
					<FolderIcon size={16} className={styles.folderIcon} />
					<h3 className={styles.name}>{folder.name}</h3>
				</div>
			</div>

			{/* ── Image zone ── */}
			<div className={styles.imageZone}>
				<div className={styles.imageBg} />
				{artCrops.length > 0 && (
					<div className={styles.thumbnails}>
						{artCrops.map((url, i) => (
							<div key={i} className={styles.thumb}>
								{/* eslint-disable-next-line @next/next/no-img-element */}
								<img src={url} alt="" />
							</div>
						))}
					</div>
				)}
				<div className={styles.folderIconOverlay}>
					<FolderIcon size={150} />
				</div>
			</div>

			{/* ── Body ── */}
			<div className={styles.body}>
				<div className={styles.stats}>
					<span>
						{decks.length} deck{decks.length !== 1 ? 's' : ''}
					</span>
					{childFolderCount > 0 && (
						<>
							<span className={styles.statSep}>·</span>
							<span>
								{childFolderCount} dossier{childFolderCount !== 1 ? 's' : ''}
							</span>
						</>
					)}
				</div>
			</div>
		</div>
	);
}
