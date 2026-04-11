'use client';

import { useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
	DndContext,
	DragOverlay,
	PointerSensor,
	pointerWithin,
	useSensor,
	useSensors,
	type DragEndEvent,
	type DragStartEvent,
} from '@dnd-kit/core';
import { snapCenterToCursor } from '@dnd-kit/modifiers';
import type { DeckMeta } from '@/types/decks';
import { useDeckContext } from '@/lib/deck/context/DeckContext';
import { useScryfallSymbols } from '@/lib/scryfall/hooks/useScryfallSymbols';
import { FolderIcon } from '@phosphor-icons/react';
import { Button } from '@/components/Button/Button';
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal';
import { Spinner } from '@/components/Spinner/Spinner';
import { CreateDeckModal } from './components/CreateDeckModal/CreateDeckModal';
import { ImportDeckModal } from './components/ImportDeckModal/ImportDeckModal';
import { DeckCard } from './components/DeckCard/DeckCard';
import { FolderCard } from './components/FolderCard/FolderCard';
import { FolderSidebar } from './components/FolderSidebar/FolderSidebar';
import { FolderBreadcrumb } from './components/FolderBreadcrumb/FolderBreadcrumb';
import { useDeckSummaries } from './hooks/useDeckSummaries';
import styles from './page.module.css';

export default function DecksPage() {
	const {
		decks,
		folders,
		isLoaded,
		createDeck,
		deleteDeck,
		createFolder,
		updateFolder,
		deleteFolder,
		moveDeckToFolder,
		moveFolderToFolder,
	} = useDeckContext();
	const router = useRouter();
	const searchParams = useSearchParams();
	const symbolMap = useScryfallSymbols();
	const summaryMap = useDeckSummaries(decks);

	const [showCreate, setShowCreate] = useState(false);
	const [showImport, setShowImport] = useState(false);
	const [deckToDelete, setDeckToDelete] = useState<string | null>(null);
	const [folderToDelete, setFolderToDelete] = useState<string | null>(null);
	const [draggingDeckId, setDraggingDeckId] = useState<string | null>(null);
	const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null);

	// Active folder from URL: null = all, 'none' = unfiled, uuid = specific folder
	const folderParam = searchParams.get('folder') as string | null;
	const activeFolderId: string | null | 'none' = folderParam ?? null;

	const handleFolderSelect = (id: string | null | 'none') => {
		if (id === null) {
			router.replace('/decks');
		} else {
			router.replace(`/decks?folder=${id}`);
		}
	};

	const foldersMap = useMemo(() => {
		const map: Record<string, (typeof folders)[0]> = {};
		for (const f of folders) map[f.id] = f;
		return map;
	}, [folders]);

	// Filter decks based on active folder
	const filteredDecks = useMemo(() => {
		if (activeFolderId === null) return decks;
		if (activeFolderId === 'none') return decks.filter((d) => d.folderId === null);
		return decks.filter((d) => d.folderId === activeFolderId);
	}, [decks, activeFolderId]);

	// Direct child folders of the active view
	const visibleFolders = useMemo(() => {
		const parentId = activeFolderId === null || activeFolderId === 'none' ? null : activeFolderId;
		if (activeFolderId === 'none') return [];
		return folders.filter((f) => f.parentId === parentId).sort((a, b) => a.position - b.position);
	}, [folders, activeFolderId]);

	// Decks grouped by folderId for FolderCard collage
	const decksByFolder = useMemo(() => {
		const map: Record<string, DeckMeta[]> = {};
		for (const deck of decks) {
			if (deck.folderId) {
				if (!map[deck.folderId]) map[deck.folderId] = [];
				map[deck.folderId].push(deck);
			}
		}
		return map;
	}, [decks]);

	// Child folder count per folder
	const childFolderCount = useMemo(() => {
		const map: Record<string, number> = {};
		for (const f of folders) {
			if (f.parentId) {
				map[f.parentId] = (map[f.parentId] ?? 0) + 1;
			}
		}
		return map;
	}, [folders]);

	// dnd-kit sensors — delay lets short clicks through, tolerance allows slight movement during hold
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
	);

	const handleDragStart = (event: DragStartEvent) => {
		if (event.active.data.current?.type === 'deck') {
			setDraggingDeckId(event.active.data.current.deckId as string);
		} else if (event.active.data.current?.type === 'folder-drag') {
			setDraggingFolderId(event.active.data.current.folderId as string);
		}
	};

	const handleDragEnd = (event: DragEndEvent) => {
		setDraggingDeckId(null);
		setDraggingFolderId(null);
		const { active, over } = event;
		if (active.data.current?.type === 'deck' && over?.data.current?.type === 'folder') {
			moveDeckToFolder(active.data.current.deckId as string, over.data.current.folderId as string);
		} else if (active.data.current?.type === 'folder-drag') {
			const draggedFolderId = active.data.current.folderId as string;
			if (!over || over.data.current?.type === 'folder-root') {
				moveFolderToFolder(draggedFolderId, null);
			} else if (over.data.current?.type === 'folder') {
				const targetFolderId = over.data.current.folderId as string;
				if (draggedFolderId !== targetFolderId) {
					moveFolderToFolder(draggedFolderId, targetFolderId);
				}
			}
		}
	};

	const draggingDeck = draggingDeckId ? decks.find((d) => d.id === draggingDeckId) : null;
	const draggingFolder = draggingFolderId ? folders.find((f) => f.id === draggingFolderId) : null;

	const activeFolderName =
		activeFolderId !== null && activeFolderId !== 'none'
			? (foldersMap[activeFolderId]?.name ?? 'Dossier')
			: activeFolderId === 'none'
				? 'Sans dossier'
				: 'My Decks';

	if (!isLoaded) {
		return (
			<div className={styles.page}>
				<div className={styles.loading}>
					<Spinner />
				</div>
			</div>
		);
	}

	const renderGrid = (deckList: typeof decks, folderList: typeof folders) => (
		<div className={styles.grid}>
			{folderList.map((folder) => (
				<FolderCard
					key={folder.id}
					folder={folder}
					decks={decksByFolder[folder.id] ?? []}
					childFolderCount={childFolderCount[folder.id] ?? 0}
					summaryMap={summaryMap}
					onClick={() => handleFolderSelect(folder.id)}
				/>
			))}
			{deckList.map((deck) => (
				<DeckCard
					key={deck.id}
					deck={deck}
					summary={summaryMap[deck.id]}
					symbolMap={symbolMap}
					folders={folders}
					onClick={() => router.push(`/decks/${deck.id}`)}
					onDelete={() => setDeckToDelete(deck.id)}
					onMove={(folderId) => moveDeckToFolder(deck.id, folderId)}
				/>
			))}
		</div>
	);

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={pointerWithin}
			onDragStart={handleDragStart}
			onDragEnd={handleDragEnd}
		>
			<div className={styles.page}>
				<div className={styles.sidebar}>
					<FolderSidebar
						folders={folders}
						decks={decks}
						activeFolderId={activeFolderId}
						onFolderSelect={handleFolderSelect}
						onCreateFolder={(name, parentId) => createFolder(name, parentId)}
						onRenameFolder={(folderId, name) => updateFolder(folderId, { name })}
						onDeleteFolder={(folderId) => setFolderToDelete(folderId)}
					/>
				</div>

				<div className={styles.main}>
					{activeFolderId !== null && (
						<FolderBreadcrumb
							activeFolderId={activeFolderId}
							folders={foldersMap}
							onNavigate={handleFolderSelect}
						/>
					)}

					<div className={styles.titleSection}>
						<div className={styles.titleLeft}>
							<h1 className={styles.title}>{activeFolderName}</h1>
							<span className={styles.statsLine}>
								{filteredDecks.length} deck{filteredDecks.length !== 1 ? 's' : ''}
							</span>
						</div>
						<div className={styles.actions}>
							<Button variant="secondary" onClick={() => setShowImport(true)}>
								Import
							</Button>
							<Button onClick={() => setShowCreate(true)}>New Deck</Button>
						</div>
					</div>

					{filteredDecks.length === 0 && visibleFolders.length === 0 && activeFolderId !== null ? (
						<div className={styles.emptyState}>
							<h2>Dossier vide</h2>
							<p>Glissez des decks ici ou créez-en un nouveau.</p>
							<Button onClick={() => setShowCreate(true)}>New Deck</Button>
						</div>
					) : activeFolderId === null ? (
						<>
							{decks.length === 0 && visibleFolders.length === 0 ? (
								<div className={styles.emptyState}>
									<h2>No decks yet</h2>
									<p>Create your first deck to start building.</p>
									<Button onClick={() => setShowCreate(true)}>New Deck</Button>
								</div>
							) : (
								renderGrid(decks, visibleFolders)
							)}
						</>
					) : (
						renderGrid(filteredDecks, visibleFolders)
					)}
				</div>
			</div>

			<DragOverlay modifiers={[snapCenterToCursor]}>
				{draggingDeck && (
					<div
						style={{
							background: 'var(--surface)',
							border: '1px solid var(--gold)',
							borderRadius: 6,
							padding: '5px 10px',
							fontSize: 13,
							color: 'var(--foreground)',
							opacity: 0.95,
							pointerEvents: 'none',
							boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
							whiteSpace: 'nowrap',
						}}
					>
						{draggingDeck.name}
					</div>
				)}
				{draggingFolder && (
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 6,
							background: 'var(--surface)',
							border: '1px solid var(--gold)',
							borderRadius: 6,
							padding: '5px 10px',
							fontSize: 13,
							color: 'var(--foreground)',
							opacity: 0.9,
							pointerEvents: 'none',
							boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
						}}
					>
						<FolderIcon size={13} color="var(--brass)" />
						{draggingFolder.name}
					</div>
				)}
			</DragOverlay>

			{showCreate && (
				<CreateDeckModal
					folders={folders}
					defaultFolderId={
						activeFolderId !== null && activeFolderId !== 'none' ? activeFolderId : null
					}
					onCreate={(name, format, description, folderId) => {
						const id = createDeck(name, format, description, folderId);
						setShowCreate(false);
						router.push(`/decks/${id}`);
					}}
					onClose={() => setShowCreate(false)}
				/>
			)}

			{showImport && <ImportDeckModal onClose={() => setShowImport(false)} />}

			{deckToDelete && (
				<ConfirmModal
					message="Are you sure you want to delete this deck? All cards in it will be removed."
					confirmLabel="Delete"
					onConfirm={() => {
						deleteDeck(deckToDelete);
						setDeckToDelete(null);
					}}
					onClose={() => setDeckToDelete(null)}
				/>
			)}

			{folderToDelete && (
				<ConfirmModal
					message="Supprimer ce dossier ? Les decks qu'il contient seront déplacés dans « Sans dossier »."
					confirmLabel="Supprimer"
					onConfirm={() => {
						deleteFolder(folderToDelete);
						setFolderToDelete(null);
					}}
					onClose={() => setFolderToDelete(null)}
				/>
			)}
		</DndContext>
	);
}
