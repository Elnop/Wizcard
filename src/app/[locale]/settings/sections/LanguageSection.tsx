'use client';

import { Select } from '@/components/Select/Select';
import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import type { Language } from '@/lib/profile/types';
import { useRouter, usePathname } from '@/i18n/navigation';
import { SettingsSection, settingsStyles as s } from '../components/SettingsSection';
import { useSaveStatus } from '../useSaveStatus';

const LANGUAGES: { value: Language; label: string }[] = [
	{ value: 'fr', label: 'Français' },
	{ value: 'en', label: 'English' },
];

export function LanguageSection() {
	const { profile, updateProfile } = useProfileContext();
	const { status, markSaving } = useSaveStatus();
	const router = useRouter();
	const pathname = usePathname();
	if (!profile) return null;

	return (
		<SettingsSection title="Langue" status={status}>
			<div className={s.field}>
				<span className={s.label}>Langue de l&apos;interface</span>
				<Select
					value={profile.language}
					options={LANGUAGES}
					ariaLabel="Langue de l'interface"
					onChange={(value) => {
						markSaving();
						updateProfile({ language: value });
						// L'URL préfixée est l'autorité de rendu : on navigue vers la
						// nouvelle locale (met aussi à jour le cookie NEXT_LOCALE).
						router.replace(pathname, { locale: value });
					}}
				/>
			</div>
			<p className={s.hint}>La langue par défaut des cartes reste l&apos;anglais pour le moment.</p>
		</SettingsSection>
	);
}
