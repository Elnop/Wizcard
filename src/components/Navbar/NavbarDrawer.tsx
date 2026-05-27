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
					href="/wishlist"
					className={`${styles.drawerLink} ${pathname === '/wishlist' ? styles.drawerLinkActive : ''}`}
					onClick={closeDrawer}
				>
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						aria-hidden="true"
						style={{ flexShrink: 0 }}
					>
						<circle cx="9" cy="21" r="1" />
						<circle cx="20" cy="21" r="1" />
						<path d="M1 1h4l2.68 13.39a2 2 0 001.99 1.61H19a2 2 0 001.96-1.64l1.54-7.96H6" />
					</svg>
					Wishlist
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
