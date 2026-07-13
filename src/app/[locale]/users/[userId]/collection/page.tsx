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
import { usePublicCollection } from './usePublicCollection';
import { useProfileShell } from '../ProfileShellContext';

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
	const t = useTranslations('profile');
	const ownerHandlers = useOwnedCardMenuHandlers(stacks, 'collection');
	const ownerMenuLabels = useOwnedCardMenuLabels('collection');
	const viewerHandlers = useViewerCardMenuHandlers();
	const viewerMenuLabels = useViewerCardMenuLabels();

	const isLoadingCollection = !isFullyLoaded || isHydrating;

	const emptyState = (
		<div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
			<h2>{t('emptyCollection')}</h2>
			<p>{t('emptyCollectionText')}</p>
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
			title={t('collectionTitle')}
			actions={actions || undefined}
			emptyState={emptyState}
			filterLayout={filterLayout}
			onCardClick={(stack) =>
				isOwner ? openCardModal(stack.cards) : openCardModal(stack.cards, { readOnly: true })
			}
			buildCardMenuItems={(stack, close) =>
				isOwner
					? buildOwnedCardMenu(stack, 'collection', ownerHandlers, close, ownerMenuLabels)
					: buildViewerCardMenu(stack.cards[0], viewerHandlers, close, viewerMenuLabels)
			}
			showDeckBadges={isOwner}
		/>
	);
}

/**
 * Collection tab of the profile shell. Always the public collection view; the
 * owner gets editable cards / owner menu via `isOwner`. Identity comes from the
 * layout via ProfileShellContext — this page does not resolve the nickname.
 */
export default function UserCollectionPage() {
	const { ownerId, isOwner } = useProfileShell();
	return <PublicCollectionView ownerId={ownerId} filterLayout="modal" isOwner={isOwner} />;
}
