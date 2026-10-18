'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/Button/Button';

/** Toolbar toggle for a list's selection mode. */
export function SelectModeButton({ active, onToggle }: { active: boolean; onToggle: () => void }) {
	const t = useTranslations('bulk');
	return (
		<Button variant="secondary" size="sm" onClick={onToggle} aria-pressed={active}>
			{active ? t('done') : t('select')}
		</Button>
	);
}
