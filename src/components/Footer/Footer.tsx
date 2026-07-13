import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { legalConfig } from '@/lib/legal/legal-config';
import styles from './Footer.module.css';

/**
 * Footer global : liens légaux (mentions légales, confidentialité, CGU) + Discord,
 * accessibles depuis toute page (exigence LCEN/RGPD). Monté dans le root layout.
 */
export function Footer() {
	const t = useTranslations('footer');
	const year = new Date().getFullYear();
	return (
		<footer className={styles.footer}>
			<nav className={styles.links} aria-label={t('legalLinks')}>
				<Link href="/mentions-legales">{t('legalNotice')}</Link>
				<Link href="/confidentialite">{t('privacy')}</Link>
				<Link href="/cgu">{t('terms')}</Link>
				<a href={legalConfig.editor.discordUrl} target="_blank" rel="noreferrer noopener">
					{t('discord')}
				</a>
			</nav>
			<p className={styles.copy}>{t('copy', { year, siteName: legalConfig.siteName })}</p>
		</footer>
	);
}
