import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { HashErrorHandler } from './HashErrorHandler';
import styles from '../login/page.module.css';
import errorStyles from './page.module.css';

// Mappe un code d'erreur Supabase vers la paire de clés (titre/description) du
// namespace `auth.error`. Un code inconnu retombe sur `default*`. `as const`
// garde les clés littérales pour le typage strict de next-intl.
const CODE_KEYS = {
	confirmation_failed: {
		title: 'confirmationFailedTitle',
		description: 'confirmationFailedDescription',
	},
	otp_expired: { title: 'otpExpiredTitle', description: 'otpExpiredDescription' },
	access_denied: { title: 'accessDeniedTitle', description: 'accessDeniedDescription' },
	default: { title: 'defaultTitle', description: 'defaultDescription' },
} as const;

export default async function AuthErrorPage({
	params,
	searchParams,
}: {
	params: Promise<{ locale: Locale }>;
	searchParams: Promise<Record<string, string>>;
}) {
	const { locale } = await params;
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: 'auth.error' });

	const sp = await searchParams;
	const code = sp.error_code ?? sp.error ?? 'unknown';
	const keys = CODE_KEYS[code as keyof typeof CODE_KEYS] ?? CODE_KEYS.default;

	return (
		<div className={styles.page}>
			{/* Intercepts errors in the hash (#error_code=otp_expired) */}
			<HashErrorHandler />
			<div className={styles.card}>
				<div className={errorStyles.icon}>⚠</div>
				<h1 className={styles.title}>{t(keys.title)}</h1>
				<p className={errorStyles.description}>{t(keys.description)}</p>
				<Link href="/auth/login" className={errorStyles.retryBtn}>
					{t('requestNewLink')}
				</Link>
			</div>
		</div>
	);
}
