'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import styles from './Navbar.module.css';

interface ProfileMenuProps {
	/** Called when the user chooses "Log out". */
	onSignOut: () => void;
	/** Called when the user navigates to the profile page (e.g. to close a drawer). */
	onNavigate?: () => void;
	/**
	 * When true, the menu expands inline (in normal flow, full width) instead
	 * of as a floating dropdown — suited to the mobile drawer, where an
	 * absolutely-positioned overlay renders poorly.
	 */
	inline?: boolean;
}

/**
 * Avatar + nickname trigger that toggles a menu with Profile / Log out.
 * Never renders the user's email. Used in both the desktop navbar (floating
 * dropdown) and the mobile drawer (inline expander).
 */
export function ProfileMenu({ onSignOut, onNavigate, inline = false }: ProfileMenuProps) {
	const { profile } = useProfileContext();
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	const displayName = profile?.nickname || 'Wizard';

	useEffect(() => {
		if (!open) return;
		const onClick = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setOpen(false);
		};
		document.addEventListener('mousedown', onClick);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('mousedown', onClick);
			document.removeEventListener('keydown', onKey);
		};
	}, [open]);

	function handleProfileClick() {
		setOpen(false);
		onNavigate?.();
	}

	function handleSignOutClick() {
		setOpen(false);
		onSignOut();
	}

	return (
		<div
			className={[styles.profileMenu, inline ? styles.profileMenuInline : '']
				.filter(Boolean)
				.join(' ')}
			ref={ref}
		>
			<button
				type="button"
				className={styles.profileTrigger}
				onClick={() => setOpen((v) => !v)}
				aria-haspopup="menu"
				aria-expanded={open}
			>
				{profile?.avatarUrl ? (
					// eslint-disable-next-line @next/next/no-img-element -- external Supabase storage URL, no next/image loader configured for it
					<img src={profile.avatarUrl} alt="" className={styles.avatar} />
				) : (
					<span className={styles.avatarFallback}>{displayName.charAt(0).toUpperCase()}</span>
				)}
				<span className={styles.userName}>{displayName}</span>
			</button>
			{open && (
				<div
					className={[styles.profileDropdown, inline ? styles.profileDropdownInline : '']
						.filter(Boolean)
						.join(' ')}
					role="menu"
				>
					<Link
						href="/profile"
						className={styles.dropdownItem}
						role="menuitem"
						onClick={handleProfileClick}
					>
						Profile
					</Link>
					<button
						type="button"
						className={`${styles.dropdownItem} ${styles.dropdownItemDanger}`}
						role="menuitem"
						onClick={handleSignOutClick}
					>
						Log out
					</button>
				</div>
			)}
		</div>
	);
}
