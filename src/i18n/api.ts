import { getTranslations } from 'next-intl/server';
import { cookies } from 'next/headers';
import { routing } from './routing';
import type { Locale } from './routing';

/**
 * Traductions pour les routes API (`src/app/api/**`), qui vivent HORS de
 * l'arbre `[locale]` : elles n'ont pas de locale d'URL. On lit la locale depuis
 * le cookie `NEXT_LOCALE` (posé par le middleware next-intl), avec repli sur la
 * locale par défaut (`fr`) — ce qui préserve les messages FR existants pour les
 * requêtes sans cookie.
 *
 * Le `namespace` est passé explicitement par l'appelant (au lieu d'être codé en
 * dur) pour que le littéral `namespace: 'apiErrors'` reste visible dans le
 * fichier de route : i18n-ally n'attache le scope des appels `t('…')` qu'à un
 * littéral `useTranslations`/`getTranslations`/`namespace:` présent dans le
 * même fichier, sinon il signale les clés comme manquantes à la racine.
 */
export async function getApiTranslations({ namespace }: { namespace: 'apiErrors' }) {
	const cookieStore = await cookies();
	const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value;
	const locale: Locale = routing.locales.includes(cookieLocale as Locale)
		? (cookieLocale as Locale)
		: routing.defaultLocale;

	return getTranslations({ locale, namespace });
}
