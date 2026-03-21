import Link from 'next/link';
import { HashErrorHandler } from './HashErrorHandler';
import styles from '../login/page.module.css';
import errorStyles from './page.module.css';

const MESSAGES: Record<string, { title: string; description: string }> = {
	confirmation_failed: {
		title: 'Lien invalide',
		description: 'Ce lien de connexion est invalide ou a déjà été utilisé.',
	},
	otp_expired: {
		title: 'Lien expiré',
		description: 'Ce lien de connexion a expiré. Les liens sont valides 1 heure.',
	},
	access_denied: {
		title: 'Accès refusé',
		description: 'La connexion a été refusée. Réessaie en demandant un nouveau lien.',
	},
};

const DEFAULT = {
	title: 'Erreur de connexion',
	description: 'Une erreur inattendue est survenue. Réessaie en demandant un nouveau lien.',
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
			{/* Intercepte les erreurs dans le hash (#error_code=otp_expired) */}
			<HashErrorHandler messages={MESSAGES} defaultMessage={DEFAULT} />
			<div className={styles.card}>
				<div className={errorStyles.icon}>⚠</div>
				<h1 className={styles.title}>{title}</h1>
				<p className={errorStyles.description}>{description}</p>
				<Link href="/auth/login" className={errorStyles.retryBtn}>
					Demander un nouveau lien
				</Link>
			</div>
		</div>
	);
}
