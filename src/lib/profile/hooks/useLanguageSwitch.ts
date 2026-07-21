'use client';

import { useCallback } from 'react';
import { useLocale } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/navigation';
import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import type { Language } from '@/lib/profile/types';

/**
 * Source unique du changement de langue de l'interface.
 *
 * L'URL préfixée est l'autorité de rendu : on navigue vers la nouvelle locale
 * (ce qui met aussi à jour le cookie `NEXT_LOCALE`). Si l'utilisateur est
 * connecté (`profile` non nul), on persiste aussi la préférence durable dans
 * `profile.language` — de sorte qu'elle le suive entre appareils et que
 * `LocaleSync` ne ré-écrase pas le choix.
 *
 * Utilisable connecté OU non connecté : sans profil, seuls l'URL et le cookie
 * changent, sans écriture DB.
 *
 * Doit être appelé dans `NextIntlClientProvider` et `ProfileProvider`.
 */
export function useLanguageSwitch(): {
	locale: Language;
	switchLocale: (next: Language) => void;
} {
	const locale = useLocale() as Language;
	const { profile, updateProfile } = useProfileContext();
	const router = useRouter();
	const pathname = usePathname();

	const switchLocale = useCallback(
		(next: Language) => {
			if (next === locale) return;
			router.replace(pathname, { locale: next });
			if (profile) updateProfile({ language: next });
		},
		[locale, pathname, router, profile, updateProfile]
	);

	return { locale, switchLocale };
}
