'use client';

import { useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import type { DeckMeta } from '@/types/decks';
import { useScryfallSymbols } from '@/lib/scryfall/hooks/useScryfallSymbols';
import { Spinner } from '@/components/Spinner/Spinner';
import { DeckCard } from '@/app/decks/components/DeckCard/DeckCard';
import { FolderCard } from '@/app/decks/components/FolderCard/FolderCard';
import { FolderBreadcrumb } from '@/app/decks/components/FolderBreadcrumb/FolderBreadcrumb';
import { useDeckSummaries } from '@/app/decks/useDeckSummaries';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import DecksPageClient from '@/app/decks/DecksPageClient';
import { usePublicDecks } from './usePublicDecks';
import styles from '@/app/decks/page.module.css';

function PublicDecksView({ userId }: { userId: string }) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const symbolMap = useScryfallSymbols();

	const { decks, folders, isLoading } = usePublicDecks(userId);
	const summaryMap = useDeckSummaries(decks);

	const folderParam = searchParams.get('folder') as string | null;
	const activeFolderId: string | null | 'none' = folderParam ?? null;

	const handleFolderSelect = (id: string | null | 'none') => {
		if (id === null) {
			router.replace(`/users/${userId}/decks`);
		} else {
			router.replace(`/users/${userId}/decks?folder=${id}`);
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
		activeFolderName = foldersMap[activeFolderId]?.name ?? 'Dossier';
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
				</div>

				{decks.length === 0 ? (
					<div className={styles.emptyState}>
						<h2>Aucun deck public</h2>
						<p>Cet utilisateur n&apos;a pas encore de decks.</p>
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
 * Canonical, shareable decks-list URL. Owner => full editable client
 * (DecksPageClient, which reads the owner DeckContext); visitor => read-only view.
 */
export default function UserDecksPage() {
	const params = useParams();
	const userId = params.userId as string;
	const { user, isLoading } = useAuth();

	if (isLoading) {
		return (
			<div className={styles.page}>
				<div className={styles.loading}>
					<Spinner />
				</div>
			</div>
		);
	}

	const isOwner = !!user && user.id === userId;
	return isOwner ? <DecksPageClient /> : <PublicDecksView userId={userId} />;
}
