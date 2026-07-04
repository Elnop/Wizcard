'use client';

import Link from 'next/link';
import styles from './UserNotFound.module.css';

/** Shown when a `/users/<nickname>/...` URL names a nickname no user has. */
export function UserNotFound() {
	return (
		<div className={styles.container}>
			<h1 className={styles.title}>User not found</h1>
			<p className={styles.text}>No wizard goes by that name.</p>
			<Link href="/" className={styles.link}>
				Back home
			</Link>
		</div>
	);
}
