'use client';

import { useTranslations } from 'next-intl';
import type { CardMenuLabels } from '@/app/[locale]/search/searchCardMenu';

/**
 * Résout les libellés du menu contextuel carte (namespace `cardMenu`) en un
 * objet passé à `buildSearchMenuItems`. Encapsulé dans son propre hook/fichier
 * pour qu'un composant consommateur n'expose qu'UN scope `useTranslations` à
 * lui — sinon i18n-ally attribue les `t()` suivants au mauvais namespace
 * lorsqu'un fichier mélange deux scopes.
 */
export function useCardMenuLabels(): CardMenuLabels {
	const t = useTranslations('cardMenu');
	return {
		viewDetails: t('viewDetails'),
		openCardPage: t('openCardPage'),
		addToCollection: t('addToCollection'),
		addToWishlist: t('addToWishlist'),
		addToDeck: t('addToDeck'),
	};
}
