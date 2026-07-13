import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';

/**
 * Config par-requête pour le rendu serveur (RSC). Charge le catalogue de
 * messages de la locale résolue depuis l'URL ; repli sur `defaultLocale` si la
 * locale demandée n'est pas supportée.
 */
export default getRequestConfig(async ({ requestLocale }) => {
	const requested = await requestLocale;
	const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

	return {
		locale,
		messages: (await import(`../../messages/${locale}.json`)).default,
	};
});
