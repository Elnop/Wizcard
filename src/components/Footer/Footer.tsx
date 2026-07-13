import { Link } from '@/i18n/navigation';
import { legalConfig } from '@/lib/legal/legal-config';
import styles from './Footer.module.css';

/**
 * Footer global : liens légaux (mentions légales, confidentialité, CGU) + Discord,
 * accessibles depuis toute page (exigence LCEN/RGPD). Monté dans le root layout.
 */
export function Footer() {
	const year = new Date().getFullYear();
	return (
		<footer className={styles.footer}>
			<nav className={styles.links} aria-label="Liens légaux">
				<Link href="/mentions-legales">Mentions légales</Link>
				<Link href="/confidentialite">Confidentialité</Link>
				<Link href="/cgu">CGU</Link>
				<a href={legalConfig.editor.discordUrl} target="_blank" rel="noreferrer noopener">
					Discord
				</a>
			</nav>
			<p className={styles.copy}>
				© {year} {legalConfig.siteName}. Projet non officiel — Magic: The Gathering est une marque
				de Wizards of the Coast.
			</p>
		</footer>
	);
}
