'use client';

import { useTranslations } from 'next-intl';
import type { OwnedCardMenuLabels, OwnedCardMenuMode } from '@/lib/card/ownedCardMenu';

/**
 * Résout les libellés du menu propriétaire (collection/wishlist) depuis le
 * namespace `cardMenu`. Les entrées `move`/`remove` dépendent du mode : en
 * collection on déplace vers la wishlist et on retire de la collection, et
 * inversement en wishlist. Encapsulé dans un hook dédié pour n'exposer qu'un
 * scope `useTranslations` par fichier consommateur (cf. useCardMenuLabels).
 */
export function useOwnedCardMenuLabels(mode: OwnedCardMenuMode): OwnedCardMenuLabels {
	const t = useTranslations('cardMenu');
	return {
		viewDetails: t('viewDetails'),
		addCopy: t('addCopy'),
		removeCopy: t('removeCopy'),
		addToDeck: t('addToDeckShort'),
		changePrint: t('changePrint'),
		move: mode === 'collection' ? t('moveToWishlist') : t('moveToCollection'),
		remove: mode === 'collection' ? t('removeFromCollection') : t('removeFromWishlist'),
	};
}
