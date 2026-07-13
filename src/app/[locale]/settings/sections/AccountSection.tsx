'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { Button } from '@/components/Button/Button';
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal';
import { SettingsSection, settingsStyles as s } from '../components/SettingsSection';

export function AccountSection() {
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
				setEmailErr(body.error ?? 'Échec de la demande.');
				return;
			}
			setEmailMsg('Un e-mail de confirmation a été envoyé à votre adresse actuelle.');
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
				setDeleteErr(body.error ?? 'Échec de la suppression.');
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
		<SettingsSection title="Compte">
			<div className={s.field}>
				<span className={s.label}>Adresse e-mail</span>
				<input className={s.input} type="email" value={user?.email ?? ''} disabled readOnly />
			</div>
			<Button variant="secondary" size="sm" onClick={requestEmailChange} disabled={busy}>
				Changer l&apos;e-mail
			</Button>
			{emailMsg && <span className={s.successText}>{emailMsg}</span>}
			{emailErr && <span className={s.errorText}>{emailErr}</span>}

			<hr className={s.divider} />

			<div className={s.dangerZone}>
				<span className={s.dangerTitle}>Zone sensible</span>
				<Button variant="danger" size="sm" onClick={() => setConfirming(true)} disabled={busy}>
					Supprimer mon compte
				</Button>
				{deleteErr && <span className={s.errorText}>{deleteErr}</span>}
			</div>
			{confirming && (
				<ConfirmModal
					message="Cette action est irréversible : votre compte et toutes vos données (collection, decks) seront définitivement supprimés."
					confirmLabel="Supprimer mon compte"
					onConfirm={deleteAccount}
					onClose={() => setConfirming(false)}
				/>
			)}
		</SettingsSection>
	);
}
