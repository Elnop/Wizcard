'use client';

import { useParams } from 'next/navigation';
import { useCollectionCards } from '@/lib/collection/hooks/useCollectionCards';
import { CollectionView } from '@/app/collection/lib/CollectionView/CollectionView';
import { ExportMenu } from '@/app/collection/ExportMenu/ExportMenu';
import { useCardModalContext } from '@/contexts/CardModalProvider';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { Spinner } from '@/components/Spinner/Spinner';
import CollectionPage from '@/app/collection/page';
import { usePublicCollection } from './usePublicCollection';
import { useProfileByNickname } from '../useProfileByNickname';
import { UserNotFound } from '../components/UserNotFound';

function PublicCollectionView({ ownerId }: { ownerId: string }) {
	const { entries, isLoaded, isFullyLoaded } = usePublicCollection(ownerId);
	const { stacks, isLoading: isHydrating, totalExpected } = useCollectionCards(entries);
	const { openCardModal } = useCardModalContext();

	const isLoadingCollection = !isFullyLoaded || isHydrating;

	const emptyState = (
		<div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
			<h2>Collection vide</h2>
			<p>This user has no public cards yet.</p>
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
			onCardClick={(stack) => openCardModal(stack.cards, { readOnly: true })}
		/>
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
	const nickname = params.userId as string;
	const { user, isLoading: authLoading } = useAuth();
	const { profile, status } = useProfileByNickname(nickname);

	if (authLoading || status === 'loading') {
		return (
			<div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
				<Spinner />
			</div>
		);
	}

	if (status === 'not-found' || !profile) {
		return <UserNotFound />;
	}

	const isOwner = !!user && user.id === profile.id;
	return isOwner ? <CollectionPage /> : <PublicCollectionView ownerId={profile.id} />;
}
