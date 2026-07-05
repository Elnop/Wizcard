'use client';

import { useParams } from 'next/navigation';
import { useCollectionCards } from '@/lib/collection/hooks/useCollectionCards';
import { CollectionView } from '@/app/collection/lib/CollectionView/CollectionView';
import { ExportMenu } from '@/app/collection/ExportMenu/ExportMenu';
import { useCardModalContext } from '@/contexts/CardModalProvider';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { Spinner } from '@/components/Spinner/Spinner';
import { buildOwnedCardMenu } from '@/lib/card/ownedCardMenu';
import { buildViewerCardMenu } from '@/lib/card/viewerCardMenu';
import { useOwnedCardMenuHandlers } from '@/lib/card/hooks/useOwnedCardMenuHandlers';
import { useViewerCardMenuHandlers } from '@/lib/card/hooks/useViewerCardMenuHandlers';
import CollectionPage from '@/app/collection/page';
import { usePublicCollection } from './usePublicCollection';
import { useProfileByNickname } from '../useProfileByNickname';
import { UserNotFound } from '../components/UserNotFound';

export function PublicCollectionView({
	ownerId,
	filterLayout,
	isOwner = false,
}: {
	ownerId: string;
	filterLayout?: 'aside' | 'modal';
	/** True when the signed-in user is viewing their OWN profile. */
	isOwner?: boolean;
}) {
	const { entries, isLoaded, isFullyLoaded } = usePublicCollection(ownerId);
	const { stacks, isLoading: isHydrating, totalExpected } = useCollectionCards(entries);
	const { openCardModal } = useCardModalContext();
	const ownerHandlers = useOwnedCardMenuHandlers(stacks, 'collection');
	const viewerHandlers = useViewerCardMenuHandlers();

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
			filterLayout={filterLayout}
			onCardClick={(stack) =>
				isOwner ? openCardModal(stack.cards) : openCardModal(stack.cards, { readOnly: true })
			}
			buildCardMenuItems={(stack, close) =>
				isOwner
					? buildOwnedCardMenu(stack, 'collection', ownerHandlers, close)
					: buildViewerCardMenu(stack.cards[0], viewerHandlers, close)
			}
			showDeckBadges={isOwner}
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
