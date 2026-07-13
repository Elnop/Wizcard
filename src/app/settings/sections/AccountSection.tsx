'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { Button } from '@/components/Button/Button';
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal';
import { SettingsSection, settingsStyles as s } from '../components/SettingsSection';

export function AccountSection() {
	const { user, signOut } = useAuth();
	const router = useRouter();
	const [email, setEmail] = useState(user?.email ?? '');
	const [emailMsg, setEmailMsg] = useState<string | null>(null);
	const [password, setPassword] = useState('');
	const [passwordConfirm, setPasswordConfirm] = useState('');
	const [pwMsg, setPwMsg] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [confirming, setConfirming] = useState(false);
	const [deleteErr, setDeleteErr] = useState<string | null>(null);

	const changeEmail = async () => {
		setEmailMsg(null);
		if (!email || email === user?.email) return;
		setBusy(true);
		try {
			const { error } = await createClient().auth.updateUser({ email });
			setEmailMsg(
				error ? `Erreur : ${error.message}` : 'Vérifiez votre boîte mail pour confirmer.'
			);
		} finally {
			setBusy(false);
		}
	};

	const changePassword = async () => {
		setPwMsg(null);
		if (password.length < 8) {
			setPwMsg('Le mot de passe doit contenir au moins 8 caractères.');
			return;
		}
		if (password !== passwordConfirm) {
			setPwMsg('Les mots de passe ne correspondent pas.');
			return;
		}
		setBusy(true);
		try {
			const { error } = await createClient().auth.updateUser({ password });
			setPwMsg(error ? `Erreur : ${error.message}` : 'Mot de passe mis à jour.');
			if (!error) {
				setPassword('');
				setPasswordConfirm('');
			}
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
				<input
					className={s.input}
					type="email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					disabled={busy}
				/>
			</div>
			<Button variant="secondary" size="sm" onClick={changeEmail} disabled={busy}>
				Changer l&apos;e-mail
			</Button>
			{emailMsg && <span className={s.successText}>{emailMsg}</span>}

			<hr className={s.divider} />

			<div className={s.field}>
				<span className={s.label}>Nouveau mot de passe</span>
				<input
					className={s.input}
					type="password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					disabled={busy}
				/>
			</div>
			<div className={s.field}>
				<span className={s.label}>Confirmer le mot de passe</span>
				<input
					className={s.input}
					type="password"
					value={passwordConfirm}
					onChange={(e) => setPasswordConfirm(e.target.value)}
					disabled={busy}
				/>
			</div>
			<Button variant="secondary" size="sm" onClick={changePassword} disabled={busy}>
				Changer le mot de passe
			</Button>
			{pwMsg && <span className={s.successText}>{pwMsg}</span>}

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
