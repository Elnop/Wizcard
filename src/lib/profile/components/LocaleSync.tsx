'use client';

import { useEffect, useRef } from 'react';
import { useLocale } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/navigation';
import { useProfileContext } from '@/lib/profile/context/ProfileContext';

/**
 * Réconcilie la locale de l'URL avec la préférence durable `profile.language`.
 *
 * L'URL préfixée est l'autorité de rendu ; le profil est la préférence
 * persistée (hydratée après auth, côté client). Au premier chargement où le
 * profil est disponible, si `profile.language` diffère de la locale de l'URL,
 * on redirige une seule fois vers la locale préférée.
 *
 * Doit être monté DANS `ProfileProvider` (accès à `useProfileContext`) et DANS
 * `NextIntlClientProvider` (accès à `useLocale`).
 *
 * Anti-boucle : `useRef` (one-shot par montage) + gate `sessionStorage`
 * (fire-once par session) pour ne pas ré-écraser agressivement une navigation
 * manuelle de l'utilisateur vers l'autre locale au cours de la même session.
 */
const SESSION_KEY = 'localeSync:done';

export function LocaleSync() {
	const locale = useLocale();
	const { profile, isLoading } = useProfileContext();
	const router = useRouter();
	const pathname = usePathname();
	const done = useRef(false);

	useEffect(() => {
		if (isLoading || !profile || done.current) return;
		if (typeof window !== 'undefined' && sessionStorage.getItem(SESSION_KEY)) {
			done.current = true;
			return;
		}

		done.current = true;
		if (typeof window !== 'undefined') sessionStorage.setItem(SESSION_KEY, '1');

		if (profile.language && profile.language !== locale) {
			router.replace(pathname, { locale: profile.language });
		}
	}, [profile, isLoading, locale, pathname, router]);

	return null;
}
