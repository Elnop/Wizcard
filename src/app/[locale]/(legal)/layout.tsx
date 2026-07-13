import { getLocale } from 'next-intl/server';
import styles from './layout.module.css';

/**
 * Layout des pages légales : largeur de lecture contenue. `lang` suit la locale
 * courante. Ne rend pas <html>/<body> — c'est un wrapper imbriqué sous le root
 * layout.
 */
export default async function LegalLayout({ children }: { children: React.ReactNode }) {
	const locale = await getLocale();
	return (
		<div lang={locale} className={styles.container}>
			<article className={styles.prose}>{children}</article>
		</div>
	);
}
