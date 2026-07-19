'use client';

import { Link, usePathname } from '@/i18n/navigation';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useWishlistContext } from '@/lib/wishlist/context/WishlistContext';
import { useImportContext } from '@/lib/import/context/ImportContext';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { useSyncQueueContext } from '@/lib/supabase/contexts/SyncQueueContext';
import { getQueueLength } from '@/lib/supabase/sync-queue';
import { SyncIndicator } from '@/lib/supabase/components/SyncIndicator/SyncIndicator';
import { WishlistIcon } from '@/lib/wishlist/components/WishlistIcon';
import { ProfileMenu } from './ProfileMenu';
import { BRAND_FONT_FAMILY } from '@/fonts/brand';
import styles from './Navbar.module.css';

const NavbarDrawer = dynamic(() => import('./NavbarDrawer').then((m) => m.NavbarDrawer), {
	ssr: false,
});

export function Navbar() {
	const t = useTranslations('nav');
	const pathname = usePathname();
	const { user, isLoading: authLoading, signOut } = useAuth();
	const { entries } = useCollectionContext();
	const { entries: wishlistEntries } = useWishlistContext();
	const { status } = useImportContext();
	const { triggerSync } = useSyncQueueContext();

	const totalCollectionCards = entries.length;
	const totalWishlistCards = wishlistEntries.length;
	const isImporting = status === 'parsing' || status === 'fetching' || status === 'merging';

	async function handleSignOut() {
		triggerSync();
		const deadline = Date.now() + 3000;
		while (getQueueLength() > 0 && Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, 200));
		}
		await signOut();
	}

	// While auth is still resolving, render nothing here so the "Connexion"
	// link doesn't flash before the profile menu appears.
	let authNode: React.ReactNode = null;
	if (!authLoading) {
		authNode = user ? (
			<ProfileMenu onSignOut={() => void handleSignOut()} />
		) : (
			<Link
				href="/auth/login"
				className={`${styles.navLink} ${pathname === '/auth/login' ? styles.navLinkActive : ''}`}
			>
				{t('login')}
			</Link>
		);
	}

	return (
		<>
			<header className={styles.navbar}>
				<Link href="/" className={styles.logo} style={{ fontFamily: BRAND_FONT_FAMILY }}>
					Wizcard
				</Link>

				{/* Desktop nav */}
				<nav className={styles.nav}>
					<Link
						href="/search"
						className={`${styles.navLink} ${pathname === '/search' ? styles.navLinkActive : ''}`}
					>
						{t('search')}
					</Link>
					<Link
						href="/studio"
						className={`${styles.navLink} ${pathname === '/studio' ? styles.navLinkActive : ''}`}
					>
						{t('studio')}
					</Link>
					<Link
						href="/sets"
						className={`${styles.navLink} ${pathname === '/sets' ? styles.navLinkActive : ''}`}
					>
						{t('sets')}
					</Link>
					<Link
						href="/decks"
						className={`${styles.navLink} ${pathname.startsWith('/decks') ? styles.navLinkActive : ''}`}
					>
						{t('decks')}
					</Link>
					<Link
						href="/wishlist"
						className={`${styles.navLink} ${pathname === '/wishlist' ? styles.navLinkActive : ''}`}
					>
						<WishlistIcon />
						{t('wishlist')}
						{totalWishlistCards > 0 && <span className={styles.badge}>{totalWishlistCards}</span>}
					</Link>
					<Link
						href="/collection"
						className={`${styles.navLink} ${pathname === '/collection' ? styles.navLinkActive : ''}`}
					>
						{t('collection')}
						{isImporting && <span className={styles.spinner} />}
						{totalCollectionCards > 0 && (
							<span className={styles.badge}>{totalCollectionCards}</span>
						)}
					</Link>
				</nav>
				<div className={styles.syncSection}>
					<SyncIndicator />
				</div>
				<div className={styles.authSection}>{authNode}</div>

				{/* Hamburger + drawer — client only, no SSR to avoid hydration mismatch */}
				<NavbarDrawer />
			</header>
		</>
	);
}
