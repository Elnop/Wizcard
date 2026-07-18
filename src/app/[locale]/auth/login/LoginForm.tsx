'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import {
	signInWithEmailOtp,
	verifyEmailOtpClient,
	signInWithOAuth,
} from '@/lib/supabase/auth/auth-client';
import styles from './page.module.css';

export function LoginForm() {
	const t = useTranslations('auth.login');
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

		const { error } = await signInWithEmailOtp(
			email,
			`${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm`
		);

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

		const { error } = await verifyEmailOtpClient(email, otp);

		if (error) {
			setError(error.message);
			setIsLoading(false);
			return;
		}

		router.push('/collection');
		router.refresh();
	}

	async function handleGoogle() {
		setError(null);
		setIsLoading(true);
		const { error } = await signInWithOAuth('google');
		// On success the browser redirects away; only reached on error.
		if (error) {
			setError(error.message);
			setIsLoading(false);
		}
	}

	if (!sent) {
		return (
			<div className={styles.loginOptions}>
				<button
					type="button"
					className={styles.googleBtn}
					onClick={handleGoogle}
					disabled={isLoading}
				>
					{t('continueWithGoogle')}
				</button>
				<div className={styles.divider}>{t('orDivider')}</div>
				<form className={styles.form} onSubmit={handleSubmitEmail}>
					<div className={styles.field}>
						<label className={styles.label} htmlFor="email">
							{t('email')}
						</label>
						<input
							id="email"
							type="email"
							className={styles.input}
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
							autoComplete="email"
							placeholder={t('emailPlaceholder')}
						/>
					</div>
					{error && <p className={styles.error}>{error}</p>}
					<button type="submit" className={styles.submitBtn} disabled={isLoading}>
						{isLoading ? t('sending') : t('sendLink')}
					</button>
				</form>
			</div>
		);
	}

	return (
		<div className={styles.sentWrapper}>
			<p className={styles.sentText}>
				{t.rich('emailSent', { email, strong: (chunks) => <strong>{chunks}</strong> })}
				<br />
				<span className={styles.sentSub}>{t('emailSentSub')}</span>
			</p>
			<form className={styles.form} onSubmit={handleSubmitOtp}>
				<div className={styles.field}>
					<label className={styles.label} htmlFor="otp">
						{t('otpLabel')}
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
					{isLoading ? t('verifying') : t('signIn')}
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
					{t('changeAddress')}
				</button>
			</form>
		</div>
	);
}
