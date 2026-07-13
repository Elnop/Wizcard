import type { routing } from '@/i18n/routing';
import type messages from '../messages/fr.json';

/**
 * Type-safety i18n : next-intl v4 dérive le type des clés de traduction et des
 * locales depuis `AppConfig`. En liant `Messages` au catalogue de référence
 * (`messages/fr.json`), une clé `t('...')` inexistante devient une erreur
 * `tsc` — c'est ce qui garde `npm run check` fiable au fil des PRs.
 */
declare module 'next-intl' {
	interface AppConfig {
		Locale: (typeof routing.locales)[number];
		Messages: typeof messages;
	}
}
