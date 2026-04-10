'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDeckContext } from '@/lib/deck/context/DeckContext';
import { Button } from '@/components/Button/Button';
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal';
import { Spinner } from '@/components/Spinner/Spinner';
import { CreateDeckModal } from './components/CreateDeckModal/CreateDeckModal';
import { ImportDeckModal } from './components/ImportDeckModal/ImportDeckModal';
import { DeckCard } from './components/DeckCard/DeckCard';
import styles from './page.module.css';

export default function DecksPage() {
	const { decks, isLoaded, createDeck, deleteDeck } = useDeckContext();
	const router = useRouter();

	const [showCreate, setShowCreate] = useState(false);
	const [showImport, setShowImport] = useState(false);
	const [deckToDelete, setDeckToDelete] = useState<string | null>(null);

	if (!isLoaded) {
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
				<div className={styles.titleSection}>
					<div className={styles.titleLeft}>
						<h1 className={styles.title}>My Decks</h1>
						<span className={styles.statsLine}>
							{decks.length} deck{decks.length !== 1 ? 's' : ''}
						</span>
					</div>
					<div className={styles.actions}>
						<Button variant="secondary" onClick={() => setShowImport(true)}>
							Import
						</Button>
						<Button onClick={() => setShowCreate(true)}>New Deck</Button>
					</div>
				</div>

				{decks.length === 0 ? (
					<div className={styles.emptyState}>
						<h2>No decks yet</h2>
						<p>Create your first deck to start building.</p>
						<Button onClick={() => setShowCreate(true)}>New Deck</Button>
					</div>
				) : (
					<div className={styles.grid}>
						{decks.map((deck) => (
							<DeckCard
								key={deck.id}
								deck={deck}
								onClick={() => router.push(`/decks/${deck.id}`)}
								onDelete={() => setDeckToDelete(deck.id)}
							/>
						))}
					</div>
				)}
			</div>

			{showCreate && (
				<CreateDeckModal
					onCreate={(name, format, description) => {
						const id = createDeck(name, format, description);
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
		</div>
	);
}
