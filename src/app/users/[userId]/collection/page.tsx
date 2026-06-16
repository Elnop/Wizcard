'use client';

import { useCallback, useState } from 'react';
import { useParams } from 'next/navigation';
import type { CardStack } from '@/types/cards';
import { useCollectionCards } from '@/app/collection/useCollectionCards';
import { CollectionView } from '@/app/collection/components/CollectionView/CollectionView';
import { CardModal } from '@/lib/card/components/CardModal/CardModal';
import { Button } from '@/components/Button/Button';
import { serializeToMoxfieldCSV, downloadCSV } from '@/lib/moxfield/serialize';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { Spinner } from '@/components/Spinner/Spinner';
import CollectionPage from '@/app/collection/page';
import { usePublicCollection } from './usePublicCollection';

function PublicCollectionView({ userId }: { userId: string }) {
	const { entries, isLoaded, isFullyLoaded } = usePublicCollection(userId);
	const { stacks, isLoading: isHydrating, totalExpected } = useCollectionCards(entries);

	const [selectedStack, setSelectedStack] = useState<CardStack | null>(null);

	const handleExport = useCallback(() => {
		downloadCSV(serializeToMoxfieldCSV(stacks.flatMap((s) => s.cards)), 'collection.csv');
	}, [stacks]);

	const isLoadingCollection = !isFullyLoaded || isHydrating;

	const emptyState = (
		<div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
			<h2>Collection vide</h2>
			<p>Cet utilisateur n&apos;a pas encore de cartes publiques.</p>
		</div>
	);

	const actions = entries.length > 0 && (
		<Button variant="secondary" onClick={handleExport} disabled={isLoadingCollection}>
			Export CSV
		</Button>
	);

	return (
		<CollectionView
			stacks={stacks}
			entryCount={entries.length}
			isHydrating={isHydrating}
			totalExpected={totalExpected}
			isLoaded={isLoaded}
			isFullyLoaded={isFullyLoaded}
			title="Collection"
			actions={actions || undefined}
			emptyState={emptyState}
			onCardClick={setSelectedStack}
		>
			<CardModal cards={selectedStack?.cards ?? null} onClose={() => setSelectedStack(null)} />
		</CollectionView>
	);
}

/**
 * Canonical, shareable collection URL. Renders the full editable owner view when
 * the signed-in user owns this collection (reusing the owner CollectionPage,
 * which reads the owner contexts — correct since it's that user's own data),
 * otherwise the public read-only view.
 */
export default function UserCollectionPage() {
	const params = useParams();
	const userId = params.userId as string;
	const { user, isLoading } = useAuth();

	if (isLoading) {
		return (
			<div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
				<Spinner />
			</div>
		);
	}

	const isOwner = !!user && user.id === userId;
	return isOwner ? <CollectionPage /> : <PublicCollectionView userId={userId} />;
}
