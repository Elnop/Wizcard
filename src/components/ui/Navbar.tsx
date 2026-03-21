'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCollectionContext } from '@/lib/supabase/contexts/CollectionContext';
import { useImportContext } from '@/lib/import/contexts/ImportContext';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { useSyncQueueContext } from '@/lib/supabase/contexts/SyncQueueContext';
import { getQueueLength } from '@/lib/supabase/sync-queue';
import { SyncIndicator } from '@/lib/supabase/components/SyncIndicator';
import styles from './Navbar.module.css';

export function Navbar() {
	const pathname = usePathname();
	const { user, signOut } = useAuth();
	const { entries } = useCollectionContext();
	const { status } = useImportContext();
	const { triggerSync } = useSyncQueueContext();

	const totalCollectionCards = entries.reduce((sum, e) => sum + e.count, 0);
	const isImporting = status === 'fetching' || status === 'merging';

	async function handleSignOut() {
		triggerSync();
		const deadline = Date.now() + 3000;
		while (getQueueLength() > 0 && Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, 200));
		}
		await signOut();
	}

	return (
		<header className={styles.navbar}>
			<Link href="/" className={styles.logo}>
				MTG Snap
			</Link>
			<nav className={styles.nav}>
				<Link
					href="/search"
					className={`${styles.navLink} ${pathname === '/search' ? styles.navLinkActive : ''}`}
				>
					Search
				</Link>
				<Link
					href="/collection"
					className={`${styles.navLink} ${pathname === '/collection' ? styles.navLinkActive : ''}`}
				>
					Collection
					{isImporting && <span className={styles.spinner} />}
					{totalCollectionCards > 0 && <span className={styles.badge}>{totalCollectionCards}</span>}
				</Link>
			</nav>
			<div className={styles.syncSection}>
				<SyncIndicator />
			</div>
			<div className={styles.authSection}>
				{user ? (
					<>
						<span className={styles.userEmail}>{user.email}</span>
						<button className={styles.signOutBtn} onClick={() => void handleSignOut()}>
							Déconnexion
						</button>
					</>
				) : (
					<Link
						href="/auth/login"
						className={`${styles.navLink} ${pathname === '/auth/login' ? styles.navLinkActive : ''}`}
					>
						Connexion
					</Link>
				)}
			</div>
		</header>
	);
}
