'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal';
import { SettingsSection } from '../components/SettingsSection';

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
			<label>
				<span>Adresse e-mail</span>
				<input
					type="email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					disabled={busy}
				/>
			</label>
			<button type="button" onClick={changeEmail} disabled={busy}>
				Changer l’e-mail
			</button>
			{emailMsg && <span style={{ fontSize: '0.85rem' }}>{emailMsg}</span>}

			<hr style={{ opacity: 0.2, width: '100%' }} />

			<label>
				<span>Nouveau mot de passe</span>
				<input
					type="password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					disabled={busy}
				/>
			</label>
			<label>
				<span>Confirmer le mot de passe</span>
				<input
					type="password"
					value={passwordConfirm}
					onChange={(e) => setPasswordConfirm(e.target.value)}
					disabled={busy}
				/>
			</label>
			<button type="button" onClick={changePassword} disabled={busy}>
				Changer le mot de passe
			</button>
			{pwMsg && <span style={{ fontSize: '0.85rem' }}>{pwMsg}</span>}

			<hr style={{ opacity: 0.2, width: '100%' }} />

			<button
				type="button"
				onClick={() => setConfirming(true)}
				disabled={busy}
				style={{ color: '#dc2626' }}
			>
				Supprimer mon compte
			</button>
			{deleteErr && <span style={{ color: '#dc2626', fontSize: '0.85rem' }}>{deleteErr}</span>}
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
