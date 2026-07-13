'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { fetchDeckMetaById } from '@/lib/deck/db/decks';
import { Spinner } from '@/components/Spinner/Spinner';
import DeckDetailOwnerView from './DeckDetailOwnerView';
import { DeckDetailReadOnlyView } from './DeckDetailReadOnlyView';
import styles from './page.module.css';

/**
 * Deck detail route. Renders the full editable owner view when the current user
 * owns the deck, otherwise a public read-only view (also used by anonymous
 * visitors). Ownership is resolved from the deck's `owner_id` vs the auth user.
 */
export default function DeckDetailPage() {
	const params = useParams();
	const deckId = params.id as string;
	const { user, isLoading: authLoading } = useAuth();

	const [ownerId, setOwnerId] = useState<string | null>(null);
	const [resolved, setResolved] = useState(false);

	useEffect(() => {
		let cancelled = false;
		async function resolve() {
			setResolved(false);
			try {
				const meta = await fetchDeckMetaById(deckId);
				if (cancelled) return;
				setOwnerId(meta?.ownerId ?? null);
			} finally {
				if (!cancelled) setResolved(true);
			}
		}
		void resolve();
		return () => {
			cancelled = true;
		};
	}, [deckId]);

	if (authLoading || !resolved) {
		return (
			<div className={styles.page}>
				<div className={styles.loading}>
					<Spinner />
				</div>
			</div>
		);
	}

	const isOwner = !!user && ownerId === user.id;

	return isOwner ? (
		<DeckDetailOwnerView deckId={deckId} />
	) : (
		<DeckDetailReadOnlyView deckId={deckId} />
	);
}
