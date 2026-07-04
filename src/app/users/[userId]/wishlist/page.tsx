'use client';

import { useParams } from 'next/navigation';
import { useCollectionCards } from '@/lib/collection/hooks/useCollectionCards';
import { CollectionView } from '@/app/collection/lib/CollectionView/CollectionView';
import { ExportMenu } from '@/app/collection/ExportMenu/ExportMenu';
import { useCardModalContext } from '@/contexts/CardModalProvider';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { Spinner } from '@/components/Spinner/Spinner';
import WishlistPage from '@/app/wishlist/page';
import { usePublicWishlist } from './usePublicWishlist';
import { useProfileByNickname } from '../useProfileByNickname';
import { UserNotFound } from '../components/UserNotFound';

export function PublicWishlistView({ ownerId }: { ownerId: string }) {
	const { entries, isLoaded, isFullyLoaded } = usePublicWishlist(ownerId);
	const { stacks, isLoading: isHydrating, totalExpected } = useCollectionCards(entries);
	const { openCardModal } = useCardModalContext();

	const isLoadingWishlist = !isFullyLoaded || isHydrating;

	const emptyState = (
		<div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
			<h2>Empty wishlist</h2>
			<p>This user has no public wishlist cards yet.</p>
		</div>
	);

	const actions = entries.length > 0 && (
		<ExportMenu
			cards={stacks.flatMap((s) => s.cards)}
			filenameBase="wishlist"
			disabled={isLoadingWishlist}
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
			title="Wishlist"
			actions={actions || undefined}
			emptyState={emptyState}
			onCardClick={(stack) => openCardModal(stack.cards, { readOnly: true })}
		/>
	);
}

/**
 * Canonical, shareable wishlist URL. The owner sees their full editable wishlist
 * (reusing the owner WishlistPage, which reads the owner contexts); visitors see
 * a read-only view of the owner's standalone wishlist cards.
 */
export default function UserWishlistPage() {
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
	return isOwner ? <WishlistPage /> : <PublicWishlistView ownerId={profile.id} />;
}
