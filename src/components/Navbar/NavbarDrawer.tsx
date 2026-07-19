'use client';

import { Link, usePathname } from '@/i18n/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useWishlistContext } from '@/lib/wishlist/context/WishlistContext';
import { useImportContext } from '@/lib/import/context/ImportContext';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { useSyncQueueContext } from '@/lib/supabase/contexts/SyncQueueContext';
import { getQueueLength } from '@/lib/supabase/sync-queue';
import { WishlistIcon } from '@/lib/wishlist/components/WishlistIcon';
import { ProfileMenu } from './ProfileMenu';
import styles from './Navbar.module.css';

export function NavbarDrawer() {
	const t = useTranslations('nav');
	const pathname = usePathname();
	const { user, isLoading: authLoading, signOut } = useAuth();
	const { entries } = useCollectionContext();
	const { entries: wishlistEntries } = useWishlistContext();
	const { status } = useImportContext();
	const { triggerSync } = useSyncQueueContext();
	const [drawerOpen, setDrawerOpen] = useState(false);

	const totalCollectionCards = entries.length;
	const totalWishlistCards = wishlistEntries.length;
	const isImporting = status === 'parsing' || status === 'fetching' || status === 'merging';

	async function handleSignOut() {
		setDrawerOpen(false);
		triggerSync();
		const deadline = Date.now() + 3000;
		while (getQueueLength() > 0 && Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, 200));
		}
		await signOut();
	}

	function closeDrawer() {
		setDrawerOpen(false);
	}

	// While auth is still resolving, render nothing so the "Connexion" link
	// doesn't flash before the profile menu appears.
	let authNode: React.ReactNode = null;
	if (!authLoading) {
		authNode = user ? (
			<ProfileMenu onSignOut={() => void handleSignOut()} onNavigate={closeDrawer} inline />
		) : (
			<Link
				href="/auth/login"
				className={`${styles.drawerLink} ${pathname === '/auth/login' ? styles.drawerLinkActive : ''}`}
				onClick={closeDrawer}
			>
				{t('login')}
			</Link>
		);
	}

	return (
		<>
			<button
				className={styles.hamburger}
				aria-label={t('menu')}
				onClick={() => setDrawerOpen((o) => !o)}
			>
				<span
					className={`${styles.hamburgerLine} ${drawerOpen ? styles.hamburgerLineOpen1 : ''}`}
				/>
				<span
					className={`${styles.hamburgerLine} ${drawerOpen ? styles.hamburgerLineOpen2 : ''}`}
				/>
				<span
					className={`${styles.hamburgerLine} ${drawerOpen ? styles.hamburgerLineOpen3 : ''}`}
				/>
			</button>

			<div
				className={`${styles.drawerBackdrop} ${drawerOpen ? styles.drawerBackdropVisible : ''}`}
				onClick={closeDrawer}
			/>

			<nav className={`${styles.drawer} ${drawerOpen ? styles.drawerOpen : ''}`}>
				<Link
					href="/search"
					className={`${styles.drawerLink} ${pathname === '/search' ? styles.drawerLinkActive : ''}`}
					onClick={closeDrawer}
				>
					{t('search')}
				</Link>
				<Link
					href="/studio"
					className={`${styles.drawerLink} ${pathname === '/studio' ? styles.drawerLinkActive : ''}`}
					onClick={closeDrawer}
				>
					{t('studio')}
				</Link>
				<Link
					href="/sets"
					className={`${styles.drawerLink} ${pathname === '/sets' ? styles.drawerLinkActive : ''}`}
					onClick={closeDrawer}
				>
					{t('sets')}
				</Link>
				<Link
					href="/decks"
					className={`${styles.drawerLink} ${pathname.startsWith('/decks') ? styles.drawerLinkActive : ''}`}
					onClick={closeDrawer}
				>
					{t('decks')}
				</Link>
				<Link
					href="/wishlist"
					className={`${styles.drawerLink} ${pathname === '/wishlist' ? styles.drawerLinkActive : ''}`}
					onClick={closeDrawer}
				>
					<WishlistIcon />
					{t('wishlist')}
					{totalWishlistCards > 0 && <span className={styles.badge}>{totalWishlistCards}</span>}
				</Link>
				<Link
					href="/collection"
					className={`${styles.drawerLink} ${pathname === '/collection' ? styles.drawerLinkActive : ''}`}
					onClick={closeDrawer}
				>
					{t('collection')}
					{isImporting && <span className={styles.spinner} />}
					{totalCollectionCards > 0 && <span className={styles.badge}>{totalCollectionCards}</span>}
				</Link>

				<div className={styles.drawerDivider} />

				{authNode}
			</nav>
		</>
	);
}
