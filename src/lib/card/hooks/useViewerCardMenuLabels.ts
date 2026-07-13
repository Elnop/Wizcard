'use client';

import { useTranslations } from 'next-intl';
import type { ViewerCardMenuLabels } from '@/lib/card/viewerCardMenu';

/**
 * Résout les libellés du menu « viewer » (menu affiché sur le profil public
 * d'un autre utilisateur, dont les actions portent sur MES propres listes)
 * depuis le namespace `profile`. Hook dédié → un seul scope useTranslations
 * par fichier consommateur (cf. useCardMenuLabels / useOwnedCardMenuLabels).
 */
export function useViewerCardMenuLabels(): ViewerCardMenuLabels {
	const t = useTranslations('profile');
	return {
		viewDetails: t('viewDetails'),
		addToCollection: t('addToMyCollection'),
		addToWishlist: t('addToMyWishlist'),
		addToDeck: t('addToMyDeck'),
	};
}
