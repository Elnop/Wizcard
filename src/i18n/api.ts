import { getTranslations } from 'next-intl/server';
import { cookies } from 'next/headers';
import { routing } from './routing';
import type { Locale } from './routing';

/**
 * Traductions pour les routes API (`src/app/api/**`), qui vivent HORS de
 * l'arbre `[locale]` : elles n'ont pas de locale d'URL. On la lit depuis le
 * cookie `NEXT_LOCALE` (posé par le middleware next-intl), avec repli sur la
 * locale par défaut (`fr`) — ce qui préserve les messages FR existants pour les
 * requêtes sans cookie. Les messages vivent sous le namespace `apiErrors`.
 */
export async function getApiTranslations() {
	const cookieStore = await cookies();
	const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value;
	const locale: Locale = routing.locales.includes(cookieLocale as Locale)
		? (cookieLocale as Locale)
		: routing.defaultLocale;

	return getTranslations({ locale, namespace: 'apiErrors' });
}
