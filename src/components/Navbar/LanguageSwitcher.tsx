'use client';

import { useTranslations } from 'next-intl';
import { Select } from '@/components/Select/Select';
import { useLanguageSwitch } from '@/lib/profile/hooks/useLanguageSwitch';
import type { Language } from '@/lib/profile/types';

/**
 * Sélecteur de langue compact pour la navbar (desktop) et le tiroir (mobile).
 * Fonctionne connecté OU non connecté : la logique de bascule (URL + cookie,
 * et persistance profil si connecté) vit dans `useLanguageSwitch`.
 *
 * Réutilise le `Select` portail de l'app (mécanique d'ouverture, clavier et
 * positionnement déjà gérés) plutôt que de re-coder un dropdown.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
	const t = useTranslations('nav');
	const { locale, switchLocale } = useLanguageSwitch();

	// Diminutifs des codes de locale (FR / EN) — universels, pas de traduction.
	const options: { value: Language; label: string }[] = [
		{ value: 'fr', label: 'FR' },
		{ value: 'en', label: 'EN' },
	];

	return (
		<Select
			value={locale}
			options={options}
			ariaLabel={t('language')}
			className={className}
			onChange={switchLocale}
		/>
	);
}
