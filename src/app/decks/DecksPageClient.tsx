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
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { FolderIcon } from '@phosphor-icons/react';
import { Button } from '@/components/Button/Button';
import { ShareButton } from '@/components/ShareButton/ShareButton';
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal';
import { Spinner } from '@/components/Spinner/Spinner';
import { CreateDeckModal } from './components/CreateDeckModal/CreateDeckModal';
import { ImportDeckModal } from './components/ImportDeckModal/ImportDeckModal';
import { DeckCard } from './components/DeckCard/DeckCard';
import { FolderCard } from './components/FolderCard/FolderCard';
import { FolderSidebar } from './components/FolderSidebar/FolderSidebar';
import { FolderBreadcrumb } from './components/FolderBreadcrumb/FolderBreadcrumb';
import { useDeckSummaries } from './useDeckSummaries';
import styles from './page.module.css';

export default function DecksPageClient() {
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
	const { user } = useAuth();
	const router = useRouter();
	const searchParams = useSearchParams();
	const symbolMap = useScryfallSymbols();
	const summaryMap = useDeckSummaries(decks);

	const [showCreate, setShowCreate] = useState(false);
	const [showImport, setShowImport] = useState(false);
	const [deckToDelete, setDeckToDelete] = useState<string | null>(null);
	const [deleteCollectionCopies, setDeleteCollectionCopies] = useState(false);
	const [folderToDelete, setFolderToDelete] = useState<string | null>(null);
	const [draggingDeckId, setDraggingDeckId] = useState<string | null>(null);
	const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null);
	const [sidebarOpen, setSidebarOpen] = useState(false);

	// Active folder from URL: null = all, 'none' = unfiled, uuid = specific folder
	const folderParam = searchParams.get('folder') as string | null;
	const activeFolderId: string | null | 'none' = folderParam ?? null;

	const handleFolderSelect = (id: string | null | 'none') => {
		setSidebarOpen(false);
		// Navigate within the canonical /users/[id]/decks URL: a bare /decks would
		// server-redirect here and drop the ?folder= query string.
		const base = user ? `/users/${user.id}/decks` : '/decks';
		if (id === null) {
			router.replace(base);
		} else {
			router.replace(`${base}?folder=${id}`);
		}
	};

	const foldersMap = useMemo(() => {
		const map: Record<string, (typeof folders)[0]> = {};
		for (const f of folders) map[f.id] = f;
		return map;
	}, [folders]);

	// Filter decks based on active folder
	const filteredDecks = useMemo(() => {
		if (activeFolderId === null) return decks.filter((d) => d.folderId === null);
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

	let activeFolderName: string;
	if (activeFolderId !== null && activeFolderId !== 'none') {
		activeFolderName = foldersMap[activeFolderId]?.name ?? 'Dossier';
	} else if (activeFolderId === 'none') {
		activeFolderName = 'Sans dossier';
	} else {
		activeFolderName = 'My Decks';
	}

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
				<div
					className={`${styles.drawerBackdrop} ${sidebarOpen ? styles.visible : ''}`}
					onClick={() => setSidebarOpen(false)}
					aria-hidden="true"
				/>

				<div className={`${styles.sidebar} ${sidebarOpen ? styles.open : ''}`}>
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
					<button
						className={styles.folderToggle}
						onClick={() => setSidebarOpen(true)}
						aria-label="Open folders"
					>
						<FolderIcon size={14} />
						Folders
					</button>

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
							{user && <ShareButton path={`/users/${user.id}/decks`} />}
							<Button variant="secondary" onClick={() => setShowImport(true)}>
								Import
							</Button>
							<Button onClick={() => setShowCreate(true)}>New Deck</Button>
						</div>
					</div>

					{filteredDecks.length === 0 && visibleFolders.length === 0 && activeFolderId !== null && (
						<div className={styles.emptyState}>
							<h2>Dossier vide</h2>
							<p>Glissez des decks ici ou créez-en un nouveau.</p>
							<Button onClick={() => setShowCreate(true)}>New Deck</Button>
						</div>
					)}
					{activeFolderId === null && decks.length === 0 && visibleFolders.length === 0 && (
						<div className={styles.emptyState}>
							<h2>No decks yet</h2>
							<p>Create your first deck to start building.</p>
							<Button onClick={() => setShowCreate(true)}>New Deck</Button>
						</div>
					)}
					{activeFolderId === null &&
						(decks.length > 0 || visibleFolders.length > 0) &&
						renderGrid(filteredDecks, visibleFolders)}
					{activeFolderId !== null &&
						(filteredDecks.length > 0 || visibleFolders.length > 0) &&
						renderGrid(filteredDecks, visibleFolders)}
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
					message="Supprimer ce deck ?"
					confirmLabel="Supprimer"
					onConfirm={() => {
						deleteDeck(deckToDelete, { deleteCollectionCopies });
						setDeckToDelete(null);
						setDeleteCollectionCopies(false);
					}}
					onClose={() => {
						setDeckToDelete(null);
						setDeleteCollectionCopies(false);
					}}
				>
					<label className={styles.deleteToggle}>
						<input
							type="checkbox"
							checked={deleteCollectionCopies}
							onChange={(e) => setDeleteCollectionCopies(e.target.checked)}
						/>
						Supprimer les cartes de la collection
					</label>
				</ConfirmModal>
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
