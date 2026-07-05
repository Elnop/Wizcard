'use client';

import { useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { DeckMeta } from '@/types/decks';
import { useScryfallSymbols } from '@/lib/scryfall/hooks/useScryfallSymbols';
import { Spinner } from '@/components/Spinner/Spinner';
import { DeckCard } from '@/app/decks/components/DeckCard/DeckCard';
import { FolderCard } from '@/app/decks/components/FolderCard/FolderCard';
import { FolderBreadcrumb } from '@/app/decks/components/FolderBreadcrumb/FolderBreadcrumb';
import { useDeckSummaries } from '@/app/decks/useDeckSummaries';
import { usePublicDecks } from './usePublicDecks';
import { useProfileShell } from '../ProfileShellContext';
import styles from '@/app/decks/page.module.css';
import tabStyles from './decksTab.module.css';

function PublicDecksView({ ownerId, handle }: { ownerId: string; handle: string }) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const symbolMap = useScryfallSymbols();

	const { decks, folders, isLoading } = usePublicDecks(ownerId);
	const summaryMap = useDeckSummaries(decks);

	const folderParam = searchParams.get('folder') as string | null;
	const activeFolderId: string | null | 'none' = folderParam ?? null;

	const handleFolderSelect = (id: string | null | 'none') => {
		if (id === null) {
			router.replace(`/users/${handle}/decks`);
		} else {
			router.replace(`/users/${handle}/decks?folder=${id}`);
		}
	};

	const foldersMap = useMemo(() => {
		const map: Record<string, (typeof folders)[0]> = {};
		for (const f of folders) map[f.id] = f;
		return map;
	}, [folders]);

	const filteredDecks = useMemo(() => {
		if (activeFolderId === null || activeFolderId === 'none')
			return decks.filter((d) => d.folderId === null);
		return decks.filter((d) => d.folderId === activeFolderId);
	}, [decks, activeFolderId]);

	const visibleFolders = useMemo(() => {
		const parentId = activeFolderId === null || activeFolderId === 'none' ? null : activeFolderId;
		if (activeFolderId === 'none') return [];
		return folders.filter((f) => f.parentId === parentId).sort((a, b) => a.position - b.position);
	}, [folders, activeFolderId]);

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

	const childFolderCount = useMemo(() => {
		const map: Record<string, number> = {};
		for (const f of folders) {
			if (f.parentId) map[f.parentId] = (map[f.parentId] ?? 0) + 1;
		}
		return map;
	}, [folders]);

	let activeFolderName: string;
	if (activeFolderId !== null && activeFolderId !== 'none') {
		activeFolderName = foldersMap[activeFolderId]?.name ?? 'Folder';
	} else {
		activeFolderName = 'Decks';
	}

	if (isLoading) {
		return (
			<div className={styles.page}>
				<div className={styles.loading}>
					<Spinner />
				</div>
			</div>
		);
	}

	return (
		<div className={styles.page}>
			<div className={`${styles.main} ${tabStyles.mainTight}`}>
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
				</div>

				{decks.length === 0 ? (
					<div className={styles.emptyState}>
						<h2>No public deck</h2>
						<p>This user has no decks yet.</p>
					</div>
				) : (
					<div className={styles.grid}>
						{visibleFolders.map((folder) => (
							<FolderCard
								key={folder.id}
								folder={folder}
								decks={decksByFolder[folder.id] ?? []}
								childFolderCount={childFolderCount[folder.id] ?? 0}
								summaryMap={summaryMap}
								onClick={() => handleFolderSelect(folder.id)}
							/>
						))}
						{filteredDecks.map((deck) => (
							<DeckCard
								key={deck.id}
								deck={deck}
								summary={summaryMap[deck.id]}
								symbolMap={symbolMap}
								readOnly
								onClick={() => router.push(`/decks/${deck.id}`)}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

/**
 * Decks tab of the profile shell. Always the public decks view (folders + all
 * decks, read-only). Identity comes from the layout via ProfileShellContext —
 * this page does not resolve the nickname.
 */
export default function UserDecksPage() {
	const { ownerId, handle } = useProfileShell();
	return <PublicDecksView ownerId={ownerId} handle={handle} />;
}
