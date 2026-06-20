'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import type { CardStack } from '@/types/cards';
import { useCollectionCards } from '@/app/collection/useCollectionCards';
import { CollectionView } from '@/app/collection/components/CollectionView/CollectionView';
import { ExportMenu } from '@/app/collection/components/ExportMenu/ExportMenu';
import { CardModal } from '@/lib/card/components/CardModal/CardModal';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { Spinner } from '@/components/Spinner/Spinner';
import CollectionPage from '@/app/collection/page';
import { usePublicCollection } from './usePublicCollection';

function PublicCollectionView({ userId }: { userId: string }) {
	const { entries, isLoaded, isFullyLoaded } = usePublicCollection(userId);
	const { stacks, isLoading: isHydrating, totalExpected } = useCollectionCards(entries);

	const [selectedStack, setSelectedStack] = useState<CardStack | null>(null);

	const isLoadingCollection = !isFullyLoaded || isHydrating;

	const emptyState = (
		<div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
			<h2>Collection vide</h2>
			<p>Cet utilisateur n&apos;a pas encore de cartes publiques.</p>
		</div>
	);

	const actions = entries.length > 0 && (
		<ExportMenu
			cards={stacks.flatMap((s) => s.cards)}
			filenameBase="collection"
			disabled={isLoadingCollection}
		/>
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
