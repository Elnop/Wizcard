'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useImportContext } from '@/lib/import/contexts/ImportContext';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { useSyncQueueContext } from '@/lib/supabase/contexts/SyncQueueContext';
import { getQueueLength } from '@/lib/supabase/sync-queue';
import styles from './Navbar.module.css';

export function NavbarDrawer() {
	const pathname = usePathname();
	const { user, signOut } = useAuth();
	const { entries } = useCollectionContext();
	const { status } = useImportContext();
	const { triggerSync } = useSyncQueueContext();
	const [drawerOpen, setDrawerOpen] = useState(false);

	const totalCollectionCards = entries.length;
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

	return (
		<>
			<button
				className={styles.hamburger}
				aria-label="Menu"
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
					Search
				</Link>
				<Link
					href="/decks"
					className={`${styles.drawerLink} ${pathname.startsWith('/decks') ? styles.drawerLinkActive : ''}`}
					onClick={closeDrawer}
				>
					Decks
				</Link>
				<Link
					href="/collection"
					className={`${styles.drawerLink} ${pathname === '/collection' ? styles.drawerLinkActive : ''}`}
					onClick={closeDrawer}
				>
					Collection
					{isImporting && <span className={styles.spinner} />}
					{totalCollectionCards > 0 && <span className={styles.badge}>{totalCollectionCards}</span>}
				</Link>

				<div className={styles.drawerDivider} />

				{user ? (
					<>
						<span className={styles.drawerEmail}>{user.email}</span>
						<button className={styles.drawerSignOutBtn} onClick={() => void handleSignOut()}>
							Déconnexion
						</button>
					</>
				) : (
					<Link
						href="/auth/login"
						className={`${styles.drawerLink} ${pathname === '/auth/login' ? styles.drawerLinkActive : ''}`}
						onClick={closeDrawer}
					>
						Connexion
					</Link>
				)}
			</nav>
		</>
	);
}
