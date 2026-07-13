import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/**
 * Wrappers de navigation locale-aware : à importer À LA PLACE de `next/link`
 * et des helpers de `next/navigation` (`useRouter`, `usePathname`, `redirect`,
 * `getPathname`). Ils préfixent automatiquement la locale courante — ex.
 * `<Link href="/decks">` rend `/fr/decks`. Les autres helpers non liés à la
 * locale (`useSearchParams`, `notFound`, `useParams`) restent importés depuis
 * `next/navigation`.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
