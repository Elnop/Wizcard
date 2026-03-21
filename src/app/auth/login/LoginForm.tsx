'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import styles from './page.module.css';

export function LoginForm() {
	const router = useRouter();
	const [email, setEmail] = useState('');
	const [otp, setOtp] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [sent, setSent] = useState(false);

	async function handleSubmitEmail(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setIsLoading(true);

		const supabase = createClient();
		const { error } = await supabase.auth.signInWithOtp({
			email,
			options: {
				emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm`,
			},
		});

		if (error) {
			setError(error.message);
			setIsLoading(false);
			return;
		}

		setSent(true);
		setIsLoading(false);
	}

	async function handleSubmitOtp(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setIsLoading(true);

		const supabase = createClient();
		const { error } = await supabase.auth.verifyOtp({
			email,
			token: otp,
			type: 'email',
		});

		if (error) {
			setError(error.message);
			setIsLoading(false);
			return;
		}

		router.push('/collection');
		router.refresh();
	}

	if (!sent) {
		return (
			<form className={styles.form} onSubmit={handleSubmitEmail}>
				<div className={styles.field}>
					<label className={styles.label} htmlFor="email">
						Email
					</label>
					<input
						id="email"
						type="email"
						className={styles.input}
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						required
						autoComplete="email"
						placeholder="ton@email.com"
					/>
				</div>
				{error && <p className={styles.error}>{error}</p>}
				<button type="submit" className={styles.submitBtn} disabled={isLoading}>
					{isLoading ? 'Envoi…' : 'Envoyer le lien de connexion'}
				</button>
			</form>
		);
	}

	return (
		<div className={styles.sentWrapper}>
			<p className={styles.sentText}>
				Email envoyé à <strong>{email}</strong>.<br />
				<span className={styles.sentSub}>
					Clique sur le lien dans le mail, ou entre le code ci-dessous.
				</span>
			</p>
			<form className={styles.form} onSubmit={handleSubmitOtp}>
				<div className={styles.field}>
					<label className={styles.label} htmlFor="otp">
						Code à 6 chiffres
					</label>
					<input
						id="otp"
						type="text"
						inputMode="numeric"
						className={`${styles.input} ${styles.inputOtp}`}
						value={otp}
						onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
						required
						autoComplete="one-time-code"
						placeholder="123456"
						maxLength={6}
					/>
				</div>
				{error && <p className={styles.error}>{error}</p>}
				<button type="submit" className={styles.submitBtn} disabled={isLoading || otp.length < 6}>
					{isLoading ? 'Vérification…' : 'Se connecter'}
				</button>
				<button
					type="button"
					className={styles.backBtn}
					onClick={() => {
						setSent(false);
						setOtp('');
						setError(null);
					}}
				>
					← Changer d&apos;adresse
				</button>
			</form>
		</div>
	);
}
