'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import styles from './SearchEntitySwitcher.module.css';

/** Les trois modes de recherche, dans l'ordre d'affichage. `href` est le chemin
 * SANS préfixe de locale — `Link` de `@/i18n/navigation` l'ajoute. */
const ENTITIES = [
	{ href: '/search/cards', labelKey: 'entityCards' },
	{ href: '/search/decks', labelKey: 'entityDecks' },
	{ href: '/search/profiles', labelKey: 'entityProfiles' },
] as const;

export function SearchEntitySwitcher() {
	const t = useTranslations('search');
	const pathname = usePathname();

	return (
		<nav className={styles.switcher} aria-label={t('entityAriaLabel')}>
			{ENTITIES.map(({ href, labelKey }) => {
				const isActive = pathname === href;
				return (
					<Link
						key={href}
						href={href}
						className={`${styles.option} ${isActive ? styles.active : ''}`}
						aria-current={isActive ? 'page' : undefined}
					>
						{t(labelKey)}
					</Link>
				);
			})}
		</nav>
	);
}
