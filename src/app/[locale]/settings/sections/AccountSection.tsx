'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { Button } from '@/components/Button/Button';
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal';
import { SettingsSection, settingsStyles as s } from '../components/SettingsSection';

export function AccountSection() {
	const t = useTranslations('settings.account');
	const { user, signOut } = useAuth();
	const router = useRouter();
	const [emailMsg, setEmailMsg] = useState<string | null>(null);
	const [emailErr, setEmailErr] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [confirming, setConfirming] = useState(false);
	const [deleteErr, setDeleteErr] = useState<string | null>(null);

	const requestEmailChange = async () => {
		setEmailMsg(null);
		setEmailErr(null);
		setBusy(true);
		try {
			const res = await fetch('/api/account/email/request', { method: 'POST' });
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				setEmailErr(body.error ?? t('emailChangeFailed'));
				return;
			}
			setEmailMsg(t('emailChangeRequested'));
		} finally {
			setBusy(false);
		}
	};

	const deleteAccount = async () => {
		setDeleteErr(null);
		setBusy(true);
		try {
			const res = await fetch('/api/account/delete', { method: 'POST' });
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				setDeleteErr(body.error ?? t('deleteFailed'));
				return;
			}
			await signOut();
			router.push('/');
		} finally {
			setBusy(false);
			setConfirming(false);
		}
	};

	return (
		<SettingsSection title={t('title')}>
			<div className={s.field}>
				<span className={s.label}>{t('email')}</span>
				<input className={s.input} type="email" value={user?.email ?? ''} disabled readOnly />
			</div>
			<Button variant="secondary" size="sm" onClick={requestEmailChange} disabled={busy}>
				{t('changeEmail')}
			</Button>
			{emailMsg && <span className={s.successText}>{emailMsg}</span>}
			{emailErr && <span className={s.errorText}>{emailErr}</span>}

			<hr className={s.divider} />

			<div className={s.dangerZone}>
				<span className={s.dangerTitle}>{t('dangerZone')}</span>
				<Button variant="danger" size="sm" onClick={() => setConfirming(true)} disabled={busy}>
					{t('deleteAccount')}
				</Button>
				{deleteErr && <span className={s.errorText}>{deleteErr}</span>}
			</div>
			{confirming && (
				<ConfirmModal
					message={t('deleteConfirm')}
					confirmLabel={t('deleteAccount')}
					onConfirm={deleteAccount}
					onClose={() => setConfirming(false)}
				/>
			)}
		</SettingsSection>
	);
}
