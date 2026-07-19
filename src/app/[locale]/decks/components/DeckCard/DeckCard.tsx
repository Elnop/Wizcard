'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useDraggable } from '@dnd-kit/core';
import type { ScryfallCardSymbol } from '@/lib/scryfall/types/scryfall';
import type { DeckMeta, FolderMeta } from '@/types/decks';
import type { DeckSummary } from '../../useDeckSummaries';
import { Link } from '@/i18n/navigation';
import { ManaSymbol } from '@/lib/scryfall/components/ManaSymbol/ManaSymbol';
import { Modal } from '@/components/Modal/Modal';
import { Button } from '@/components/Button/Button';
import { MiniManaCurve } from './MiniManaCurve';
import styles from './DeckCard.module.css';

type Props = {
	deck: DeckMeta;
	summary?: DeckSummary;
	symbolMap: Record<string, ScryfallCardSymbol>;
	folders?: FolderMeta[];
	onClick: () => void;
	onDelete?: () => void;
	onMove?: (folderId: string | null) => void;
	/** Create a new folder (in the active view) and move this deck into it. */
	onCreateFolderAndMove?: (name: string) => void;
	/** Read-only (public) view: hides delete, disables drag and the move menu. */
	readOnly?: boolean;
	/** Author nickname, overlaid top-left on the cover (used by deck search). */
	authorNickname?: string | null;
};

/**
 * Relative "time ago" label, localized via Intl.RelativeTimeFormat. `justNow`
 * (< 1 min) is passed in from the caller's translations since RelativeTimeFormat
 * has no "just now" unit.
 */
function formatRelativeDate(iso: string, locale: string, justNow: string): string {
	const date = new Date(iso);
	const diffMs = date.getTime() - Date.now();
	const diffMin = Math.round(diffMs / 60000);
	const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

	const absMin = Math.abs(diffMin);
	if (absMin < 1) return justNow;
	if (absMin < 60) return rtf.format(diffMin, 'minute');
	const diffHours = Math.round(diffMin / 60);
	if (Math.abs(diffHours) < 24) return rtf.format(diffHours, 'hour');
	const diffDays = Math.round(diffHours / 24);
	if (Math.abs(diffDays) <= 30) return rtf.format(diffDays, 'day');
	return rtf.format(Math.round(diffDays / 30), 'month');
}

type ContextMenuState = { x: number; y: number } | null;

function NewFolderModal({
	onSubmit,
	onClose,
}: {
	onSubmit: (name: string) => void;
	onClose: () => void;
}) {
	const t = useTranslations('decks');
	const [name, setName] = useState('');
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	const handleSubmit = () => {
		const trimmed = name.trim();
		if (trimmed) onSubmit(trimmed);
		onClose();
	};

	return (
		<Modal onClose={onClose} className={styles.newFolderDialog} zIndex={1100}>
			<p className={styles.newFolderTitle}>{t('newFolder')}</p>
			<input
				ref={inputRef}
				className={styles.newFolderInput}
				placeholder={t('folderName')}
				value={name}
				onChange={(e) => setName(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === 'Enter') handleSubmit();
					if (e.key === 'Escape') onClose();
				}}
			/>
			<div className={styles.newFolderActions}>
				<Button variant="secondary" size="sm" onClick={onClose}>
					{t('cancel')}
				</Button>
				<Button size="sm" onClick={handleSubmit}>
					{t('create')}
				</Button>
			</div>
		</Modal>
	);
}

function MoveMenu({
	folders,
	currentFolderId,
	onMove,
	onNewFolder,
	onClose,
	position,
}: {
	folders: FolderMeta[];
	currentFolderId: string | null;
	onMove: (folderId: string | null) => void;
	onNewFolder?: () => void;
	onClose: () => void;
	position: { x: number; y: number };
}) {
	const t = useTranslations('decks');
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
			{onNewFolder && (
				<>
					<button
						className={styles.contextItem}
						onClick={() => {
							onNewFolder();
							onClose();
						}}
					>
						{t('newFolderPlus')}
					</button>
					<div className={styles.contextDivider} />
				</>
			)}
			{currentFolderId !== null && (
				<button
					className={styles.contextItem}
					onClick={() => {
						onMove(null);
						onClose();
					}}
				>
					{t('removeFromFolder')}
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
				<span className={styles.contextEmpty}>{t('noFolder')}</span>
			)}
		</div>
	);
}

export function DeckCard({
	deck,
	summary,
	symbolMap,
	folders,
	onClick,
	onDelete,
	onMove,
	onCreateFolderAndMove,
	readOnly = false,
	authorNickname,
}: Props) {
	const t = useTranslations('decks');
	const locale = useLocale();
	const colors = summary?.colors;
	const hasManaCurve = summary?.manaCurve && Object.keys(summary.manaCurve).length > 0;
	const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
	const [showNewFolder, setShowNewFolder] = useState(false);

	const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
		id: deck.id,
		data: { type: 'deck', deckId: deck.id },
	});

	const handleContextMenu = (e: React.MouseEvent) => {
		if (readOnly || !onMove || !folders) return;
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
				ref={readOnly ? undefined : setNodeRef}
				{...(readOnly ? {} : attributes)}
				{...(readOnly ? {} : listeners)}
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
						{!readOnly && onDelete && (
							<button
								type="button"
								className={styles.deleteBtn}
								onClick={(e) => {
									e.stopPropagation();
									onDelete();
								}}
								aria-label={t('deleteDeckAria')}
							>
								&times;
							</button>
						)}
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
					{/* Author nickname overlaid top-left on the cover (deck search),
					    linking to the author's profile. stopPropagation so clicking the
					    name opens the profile, not the deck. A dark scrim behind it keeps
					    the name legible over bright art. */}
					{authorNickname && (
						<>
							<div className={styles.authorScrim} />
							<Link
								href={`/users/${encodeURIComponent(authorNickname)}`}
								className={styles.author}
								onClick={(e) => e.stopPropagation()}
							>
								{authorNickname}
							</Link>
						</>
					)}
					{/* Color pips overlaid on the cover (moved off the header row to save
					    space there). */}
					{colors && colors.length > 0 && (
						<div className={styles.colors}>
							{colors.map((color) => (
								<ManaSymbol key={color} symbol={`{${color}}`} symbolMap={symbolMap} />
							))}
						</div>
					)}
					{/* Commander name overlaid on the cover (kept off the body so the body
					    stays compact and never clips its content). */}
					{summary?.commanderName && (
						<p className={styles.commanderName}>{summary.commanderName}</p>
					)}
					{hasManaCurve && (
						<div className={styles.curveOverlay}>
							<MiniManaCurve curve={summary!.manaCurve} />
						</div>
					)}
				</div>

				{/* ── Body zone ── */}
				<div className={styles.body}>
					<div className={styles.metaRow}>
						{deck.format && <span className={styles.format}>{deck.format}</span>}
						{summary && deck.format && summary.warningCount > 0 && (
							<span
								className={styles.warningBadge}
								aria-label={t('warningCount', { count: summary.warningCount })}
							>
								<span aria-hidden="true">⚠</span>
								{summary.warningCount}
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
					<span className={styles.updatedAt}>
						{formatRelativeDate(deck.updatedAt, locale, t('justNow'))}
					</span>
				</div>
			</div>

			{contextMenu && onMove && folders && (
				<MoveMenu
					folders={folders}
					currentFolderId={deck.folderId}
					onMove={onMove}
					onNewFolder={onCreateFolderAndMove ? () => setShowNewFolder(true) : undefined}
					onClose={() => setContextMenu(null)}
					position={contextMenu}
				/>
			)}

			{showNewFolder && onCreateFolderAndMove && (
				<NewFolderModal onSubmit={onCreateFolderAndMove} onClose={() => setShowNewFolder(false)} />
			)}
		</>
	);
}
