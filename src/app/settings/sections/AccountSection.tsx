'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { SettingsSection } from '../components/SettingsSection';

export function AccountSection() {
	const { user } = useAuth();
	const [email, setEmail] = useState(user?.email ?? '');
	const [emailMsg, setEmailMsg] = useState<string | null>(null);
	const [password, setPassword] = useState('');
	const [passwordConfirm, setPasswordConfirm] = useState('');
	const [pwMsg, setPwMsg] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

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
		</SettingsSection>
	);
}
