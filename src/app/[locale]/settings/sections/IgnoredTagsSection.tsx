'use client';

import { useTranslations } from 'next-intl';
import { TagInput } from '@/lib/mpc/components/TagInput/TagInput';
import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import { SettingsSection, settingsStyles as s } from '../components/SettingsSection';
import { useSaveStatus } from '../useSaveStatus';

export function IgnoredTagsSection() {
	const t = useTranslations('settings.ignoredTags');
	const { profile, updateProfile } = useProfileContext();
	const { status, markSaving } = useSaveStatus();
	if (!profile) return null;

	const ignoredTags = profile.ignoredTags ?? [];

	const add = (tag: string) => {
		const normalized = tag.trim().toLowerCase();
		if (!normalized || ignoredTags.includes(normalized)) return;
		markSaving();
		updateProfile({ ignoredTags: [...ignoredTags, normalized] });
	};

	const remove = (tag: string) => {
		markSaving();
		updateProfile({ ignoredTags: ignoredTags.filter((x) => x !== tag) });
	};

	return (
		<SettingsSection title={t('title')} status={status}>
			<p className={s.hint}>{t('description')}</p>
			<TagInput
				variant="neutral"
				allowFreeText
				selected={ignoredTags}
				onAdd={add}
				onRemove={remove}
				removeLabel={t('removeLabel')}
				placeholder={t('placeholder')}
				emptyLabel={t('noTagFound')}
				addLabel={(q) => t('addTag', { query: q })}
			/>
			{ignoredTags.length === 0 && <p className={s.hint}>{t('empty')}</p>}
		</SettingsSection>
	);
}
