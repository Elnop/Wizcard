'use client';

import { useState, useRef, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { ScryfallCardSymbol } from '@/lib/scryfall/types/scryfall';
import type { DeckMeta, FolderMeta } from '@/types/decks';
import type { DeckSummary } from '../../useDeckSummaries';
import { ManaSymbol } from '@/lib/scryfall/components/ManaSymbol/ManaSymbol';
import { MiniManaCurve } from './MiniManaCurve';
import styles from './DeckCard.module.css';

type Props = {
	deck: DeckMeta;
	summary?: DeckSummary;
	symbolMap: Record<string, ScryfallCardSymbol>;
	folders?: FolderMeta[];
	onClick: () => void;
	onDelete: () => void;
	onMove?: (folderId: string | null) => void;
};

function formatRelativeDate(iso: string): string {
	const date = new Date(iso);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffSec = Math.floor(diffMs / 1000);
	const diffMin = Math.floor(diffSec / 60);
	const diffHours = Math.floor(diffMin / 60);
	const diffDays = Math.floor(diffHours / 24);

	if (diffDays > 30) {
		const diffMonths = Math.floor(diffDays / 30);
		return diffMonths === 1 ? 'il y a 1 mois' : `il y a ${diffMonths} mois`;
	}
	if (diffDays > 0) {
		return diffDays === 1 ? 'il y a 1 jour' : `il y a ${diffDays} jours`;
	}
	if (diffHours > 0) {
		return diffHours === 1 ? 'il y a 1 heure' : `il y a ${diffHours} heures`;
	}
	if (diffMin > 0) {
		return diffMin === 1 ? 'il y a 1 min' : `il y a ${diffMin} min`;
	}
	return "à l'instant";
}

type ContextMenuState = { x: number; y: number } | null;

function MoveMenu({
	folders,
	currentFolderId,
	onMove,
	onClose,
	position,
}: {
	folders: FolderMeta[];
	currentFolderId: string | null;
	onMove: (folderId: string | null) => void;
	onClose: () => void;
	position: { x: number; y: number };
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
		<div
			ref={ref}
			className={styles.contextMenu}
			style={{ top: position.y, left: position.x }}
			onClick={(e) => e.stopPropagation()}
		>
			{currentFolderId !== null && (
				<button
					className={styles.contextItem}
					onClick={() => {
						onMove(null);
						onClose();
					}}
				>
					Retirer du dossier
				</button>
			)}
			{folders.length > 0 && <div className={styles.contextDivider} />}
			{folders.map((folder) => (
				<button
					key={folder.id}
					className={`${styles.contextItem} ${folder.id === currentFolderId ? styles.contextItemActive : ''}`}
					onClick={() => {
						if (folder.id !== currentFolderId) onMove(folder.id);
						onClose();
					}}
				>
					{folder.id === currentFolderId ? '✓ ' : ''}
					{folder.name}
				</button>
			))}
			{folders.length === 0 && currentFolderId === null && (
				<span className={styles.contextEmpty}>Aucun dossier</span>
			)}
		</div>
	);
}

export function DeckCard({ deck, summary, symbolMap, folders, onClick, onDelete, onMove }: Props) {
	const colors = summary?.colors;
	const hasManaCurve = summary?.manaCurve && Object.keys(summary.manaCurve).length > 0;
	const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);

	const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
		id: deck.id,
		data: { type: 'deck', deckId: deck.id },
	});

	const handleContextMenu = (e: React.MouseEvent) => {
		if (!onMove || !folders) return;
		e.preventDefault();
		const MENU_WIDTH = 200;
		const MENU_HEIGHT = 300;
		const x = Math.min(e.clientX, window.innerWidth - MENU_WIDTH - 8);
		const y = Math.min(e.clientY, window.innerHeight - MENU_HEIGHT - 8);
		setContextMenu({ x, y });
	};

	return (
		<>
			<div
				ref={setNodeRef}
				{...attributes}
				{...listeners}
				role="button"
				tabIndex={0}
				className={`${styles.card} ${isDragging ? styles.dragging : ''}`}
				onClick={isDragging ? undefined : onClick}
				onKeyDown={(e) => {
					if (e.key === 'Enter') onClick();
				}}
				onContextMenu={handleContextMenu}
			>
				{/* ── Header bar ── */}
				<div className={styles.header}>
					<h3 className={styles.name}>{deck.name}</h3>
					<div className={styles.headerRight}>
						{colors && colors.length > 0 && (
							<div className={styles.colors}>
								{colors.map((color) => (
									<ManaSymbol key={color} symbol={`{${color}}`} symbolMap={symbolMap} />
								))}
							</div>
						)}
						<button
							type="button"
							className={styles.deleteBtn}
							onClick={(e) => {
								e.stopPropagation();
								onDelete();
							}}
							aria-label="Delete deck"
						>
							&times;
						</button>
					</div>
				</div>

				{/* ── Image zone ── */}
				<div className={styles.imageZone}>
					{summary?.artCropUrl && (
						<>
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img src={summary.artCropUrl} alt="" className={styles.artCrop} />
							<div className={styles.artOverlay} />
						</>
					)}
					{hasManaCurve && (
						<div className={styles.curveOverlay}>
							<MiniManaCurve curve={summary!.manaCurve} />
						</div>
					)}
				</div>

				{/* ── Body zone ── */}
				<div className={styles.body}>
					{summary?.commanderName && (
						<p className={styles.commanderName}>{summary.commanderName}</p>
					)}
					<div className={styles.metaRow}>
						{deck.format && <span className={styles.format}>{deck.format}</span>}
						{summary && deck.format && summary.warningCount > 0 && (
							<span className={styles.warningBadge}>
								{summary.warningCount} warning{summary.warningCount !== 1 ? 's' : ''}
								<span className={styles.warningTooltip}>
									{summary.warnings.map((msg, i) => (
										<span key={i} className={styles.warningTooltipItem}>
											{msg}
										</span>
									))}
								</span>
							</span>
						)}
					</div>
					{deck.description && <p className={styles.description}>{deck.description}</p>}
					<div className={styles.footer}>
						{summary && summary.totalCards > 0 ? (
							<div className={styles.statsRow}>
								<span className={styles.stat}>
									{summary.targetCards !== null
										? `${summary.totalCards}/${summary.targetCards}`
										: summary.totalCards}{' '}
									cards
								</span>
								<span className={styles.statSep}>·</span>
								<span className={styles.stat}>{summary.landCount} lands</span>
								<span className={styles.statSep}>·</span>
								<span className={styles.stat}>{summary.averageCmc.toFixed(1)} CMC</span>
							</div>
						) : (
							<div />
						)}
						<span className={styles.updatedAt}>{formatRelativeDate(deck.updatedAt)}</span>
					</div>
				</div>
			</div>

			{contextMenu && onMove && folders && (
				<MoveMenu
					folders={folders}
					currentFolderId={deck.folderId}
					onMove={onMove}
					onClose={() => setContextMenu(null)}
					position={contextMenu}
				/>
			)}
		</>
	);
}
