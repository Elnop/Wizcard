'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { verifyEmailChangeOtp } from '@/lib/supabase/auth/auth-client';
import { Button } from '@/components/Button/Button';
import { settingsStyles as s } from '@/app/settings/components/SettingsSection';

type Step = 'enter-email' | 'enter-code' | 'done';

export default function ChangeEmailView({ token }: { token: string }) {
	const router = useRouter();
	const [step, setStep] = useState<Step>('enter-email');
	const [newEmail, setNewEmail] = useState('');
	const [code, setCode] = useState('');
	const [err, setErr] = useState<string | null>(null);
	const [msg, setMsg] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const submitNewEmail = async () => {
		setErr(null);
		const email = newEmail.trim().toLowerCase();
		if (!email) {
			setErr('Entrez une adresse e-mail.');
			return;
		}
		setBusy(true);
		try {
			const res = await fetch('/api/account/email/confirm', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token, newEmail: email }),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				setErr(body.error ?? 'Échec de la demande.');
				return;
			}
			setStep('enter-code');
			setMsg(`Un code de confirmation a été envoyé à ${email}.`);
		} finally {
			setBusy(false);
		}
	};

	const submitCode = async () => {
		setErr(null);
		const c = code.trim();
		if (c.length < 6) {
			setErr('Entrez le code à 6 chiffres.');
			return;
		}
		setBusy(true);
		try {
			const { error } = await verifyEmailChangeOtp(newEmail.trim().toLowerCase(), c);
			if (error) {
				setErr(`Code invalide : ${error.message}`);
				return;
			}
			setStep('done');
			setMsg('Adresse e-mail mise à jour.');
			setTimeout(() => router.push('/settings'), 1200);
		} finally {
			setBusy(false);
		}
	};

	return (
		<main style={{ maxWidth: 480, margin: '0 auto', padding: '2rem 1rem' }}>
			<h1 className={s.label} style={{ fontSize: 'var(--text-2xl)', marginBottom: '1.5rem' }}>
				Changer d’adresse e-mail
			</h1>

			{step === 'enter-email' && (
				<div className={s.field}>
					<span className={s.label}>Nouvelle adresse e-mail</span>
					<input
						className={s.input}
						type="email"
						value={newEmail}
						onChange={(e) => setNewEmail(e.target.value)}
						placeholder="nouvelle@adresse.fr"
						disabled={busy}
					/>
					<Button variant="secondary" size="sm" onClick={submitNewEmail} disabled={busy}>
						Continuer
					</Button>
				</div>
			)}

			{step === 'enter-code' && (
				<div className={s.field}>
					<span className={s.label}>Code reçu sur la nouvelle adresse</span>
					<input
						className={s.input}
						type="text"
						inputMode="numeric"
						autoComplete="one-time-code"
						pattern="[0-9]*"
						maxLength={6}
						value={code}
						onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
						placeholder="123456"
						disabled={busy}
					/>
					<Button variant="secondary" size="sm" onClick={submitCode} disabled={busy}>
						Vérifier le code
					</Button>
				</div>
			)}

			{msg && <p className={s.successText}>{msg}</p>}
			{err && <p className={s.errorText}>{err}</p>}
		</main>
	);
}
