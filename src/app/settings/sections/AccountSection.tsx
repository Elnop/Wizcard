'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { verifyEmailChangeOtp } from '@/lib/supabase/auth/auth-client';
import { Button } from '@/components/Button/Button';
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal';
import { SettingsSection, settingsStyles as s } from '../components/SettingsSection';

// Secure email change is a two-leg OTP flow (double_confirm_changes = true):
// Supabase mails a 6-digit code to BOTH the current and the new address. We
// verify them sequentially — current address first, then new — and the change
// commits once both legs succeed, then the view returns to idle.
type EmailStep = 'idle' | 'old' | 'new';

export function AccountSection() {
	const { user, signOut } = useAuth();
	const router = useRouter();
	const [email, setEmail] = useState(user?.email ?? '');
	const [emailMsg, setEmailMsg] = useState<string | null>(null);
	const [emailErr, setEmailErr] = useState<string | null>(null);
	const [emailStep, setEmailStep] = useState<EmailStep>('idle');
	const [pendingEmail, setPendingEmail] = useState('');
	const [otp, setOtp] = useState('');
	const [password, setPassword] = useState('');
	const [passwordConfirm, setPasswordConfirm] = useState('');
	const [pwMsg, setPwMsg] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [confirming, setConfirming] = useState(false);
	const [deleteErr, setDeleteErr] = useState<string | null>(null);

	const currentEmail = user?.email ?? '';

	const changeEmail = async () => {
		setEmailMsg(null);
		setEmailErr(null);
		if (!email || email === currentEmail) return;
		setBusy(true);
		try {
			const { error } = await createClient().auth.updateUser({ email });
			if (error) {
				setEmailErr(`Erreur : ${error.message}`);
				return;
			}
			// Two codes were sent (current + new address); collect them in order.
			setPendingEmail(email);
			setOtp('');
			setEmailStep('old');
			setEmailMsg('Un code a été envoyé à votre adresse actuelle et à la nouvelle adresse.');
		} finally {
			setBusy(false);
		}
	};

	const verifyStep = async () => {
		setEmailErr(null);
		const code = otp.trim();
		if (code.length < 6) {
			setEmailErr('Entrez le code à 6 chiffres.');
			return;
		}
		// Verify against whichever address this leg's code was delivered to.
		const target = emailStep === 'old' ? currentEmail : pendingEmail;
		setBusy(true);
		try {
			const { error } = await verifyEmailChangeOtp(target, code);
			if (error) {
				setEmailErr(`Code invalide : ${error.message}`);
				return;
			}
			setOtp('');
			if (emailStep === 'old') {
				setEmailStep('new');
				setEmailMsg(
					'Adresse actuelle confirmée. Entrez maintenant le code reçu sur la nouvelle adresse.'
				);
			} else {
				// Both legs verified — the session's email is now updated. Reflect
				// the new address in the field and return to the idle view.
				setEmail(pendingEmail);
				setPendingEmail('');
				setEmailStep('idle');
				setEmailMsg('Adresse e-mail mise à jour.');
			}
		} finally {
			setBusy(false);
		}
	};

	const cancelEmailChange = () => {
		setEmailStep('idle');
		setOtp('');
		setEmailErr(null);
		setEmailMsg(null);
		setPendingEmail('');
		setEmail(currentEmail);
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
					disabled={busy || emailStep !== 'idle'}
				/>
			</div>

			{emailStep === 'idle' && (
				<Button variant="secondary" size="sm" onClick={changeEmail} disabled={busy}>
					Changer l&apos;e-mail
				</Button>
			)}

			{(emailStep === 'old' || emailStep === 'new') && (
				<div className={s.field}>
					<span className={s.label}>
						{emailStep === 'old'
							? `Code reçu sur votre adresse actuelle (${currentEmail})`
							: `Code reçu sur la nouvelle adresse (${pendingEmail})`}
					</span>
					<input
						className={s.input}
						type="text"
						inputMode="numeric"
						autoComplete="one-time-code"
						pattern="[0-9]*"
						maxLength={6}
						value={otp}
						onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
						placeholder="123456"
						disabled={busy}
					/>
					<div style={{ display: 'flex', gap: '0.5rem' }}>
						<Button variant="secondary" size="sm" onClick={verifyStep} disabled={busy}>
							Vérifier le code
						</Button>
						<Button variant="ghost" size="sm" onClick={cancelEmailChange} disabled={busy}>
							Annuler
						</Button>
					</div>
				</div>
			)}

			{emailMsg && <span className={s.successText}>{emailMsg}</span>}
			{emailErr && <span className={s.errorText}>{emailErr}</span>}

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
