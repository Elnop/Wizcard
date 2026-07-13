import styles from './layout.module.css';

/**
 * Layout des pages légales : largeur de lecture contenue, `lang="fr"` local
 * (le root layout est en anglais). Ne rend pas <html>/<body> — c'est un wrapper
 * imbriqué sous le root layout.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
	return (
		<div lang="fr" className={styles.container}>
			<article className={styles.prose}>{children}</article>
		</div>
	);
}
