'use client';

import { useTranslations } from 'next-intl';
import { useCollectionCards } from '@/lib/collection/hooks/useCollectionCards';
import { CollectionView } from '@/app/[locale]/collection/lib/CollectionView/CollectionView';
import { ExportMenu } from '@/app/[locale]/collection/ExportMenu/ExportMenu';
import { useCardModalContext } from '@/contexts/CardModalProvider';
import { buildOwnedCardMenu } from '@/lib/card/ownedCardMenu';
import { useOwnedCardMenuLabels } from '@/lib/card/hooks/useOwnedCardMenuLabels';
import { buildViewerCardMenu } from '@/lib/card/viewerCardMenu';
import { useViewerCardMenuLabels } from '@/lib/card/hooks/useViewerCardMenuLabels';
import { useOwnedCardMenuHandlers } from '@/lib/card/hooks/useOwnedCardMenuHandlers';
import { useViewerCardMenuHandlers } from '@/lib/card/hooks/useViewerCardMenuHandlers';
import { usePublicWishlist } from './usePublicWishlist';
import { useProfileShell } from '../ProfileShellContext';

export function PublicWishlistView({
	ownerId,
	filterLayout,
	isOwner = false,
}: {
	ownerId: string;
	filterLayout?: 'aside' | 'modal';
	/** True when the signed-in user is viewing their OWN profile. */
	isOwner?: boolean;
}) {
	const { entries, isLoaded, isFullyLoaded } = usePublicWishlist(ownerId);
	const { stacks, isLoading: isHydrating, totalExpected } = useCollectionCards(entries);
	const { openCardModal } = useCardModalContext();
	const t = useTranslations('profile');
	const ownerHandlers = useOwnedCardMenuHandlers(stacks, 'wishlist');
	const ownerMenuLabels = useOwnedCardMenuLabels('wishlist');
	const viewerHandlers = useViewerCardMenuHandlers();
	const viewerMenuLabels = useViewerCardMenuLabels();

	const isLoadingWishlist = !isFullyLoaded || isHydrating;

	const emptyState = (
		<div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
			<h2>{t('emptyWishlist')}</h2>
			<p>{t('emptyWishlistText')}</p>
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
			title={t('wishlistTitle')}
			actions={actions || undefined}
			emptyState={emptyState}
			filterLayout={filterLayout}
			onCardClick={(stack) =>
				isOwner ? openCardModal(stack.cards) : openCardModal(stack.cards, { readOnly: true })
			}
			buildCardMenuItems={(stack, close) =>
				isOwner
					? buildOwnedCardMenu(stack, 'wishlist', ownerHandlers, close, ownerMenuLabels)
					: buildViewerCardMenu(stack.cards[0], viewerHandlers, close, viewerMenuLabels)
			}
			showDeckBadges={isOwner}
		/>
	);
}

/**
 * Wishlist tab of the profile shell. Always the public wishlist view; the owner
 * gets editable cards / owner menu via `isOwner`. Identity comes from the layout
 * via ProfileShellContext — this page does not resolve the nickname.
 */
export default function UserWishlistPage() {
	const { ownerId, isOwner } = useProfileShell();
	return <PublicWishlistView ownerId={ownerId} filterLayout="modal" isOwner={isOwner} />;
}
