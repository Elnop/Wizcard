import Link from 'next/link';
import { HashErrorHandler } from './HashErrorHandler';
import styles from '../login/page.module.css';
import errorStyles from './page.module.css';

const MESSAGES: Record<string, { title: string; description: string }> = {
	confirmation_failed: {
		title: 'Lien invalide',
		description: 'This sign-in link is invalid or has already been used.',
	},
	otp_expired: {
		title: 'Link expired',
		description: 'This sign-in link has expired. Links are valid for 1 hour.',
	},
	access_denied: {
		title: 'Access denied',
		description: 'The sign-in was refused. Try again by requesting a new link.',
	},
};

const DEFAULT = {
	title: 'Sign-in error',
	description: 'An unexpected error occurred. Try again by requesting a new link.',
};

export default async function AuthErrorPage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string>>;
}) {
	const params = await searchParams;
	const code = params.error_code ?? params.error ?? 'unknown';
	const { title, description } = MESSAGES[code] ?? DEFAULT;

	return (
		<div className={styles.page}>
			{/* Intercepts errors in the hash (#error_code=otp_expired) */}
			<HashErrorHandler messages={MESSAGES} defaultMessage={DEFAULT} />
			<div className={styles.card}>
				<div className={errorStyles.icon}>⚠</div>
				<h1 className={styles.title}>{title}</h1>
				<p className={errorStyles.description}>{description}</p>
				<Link href="/auth/login" className={errorStyles.retryBtn}>
					Request a new link
				</Link>
			</div>
		</div>
	);
}
