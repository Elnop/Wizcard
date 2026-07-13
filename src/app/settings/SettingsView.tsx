'use client';

import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import { Spinner } from '@/components/Spinner/Spinner';
import styles from './SettingsView.module.css';

export default function SettingsView() {
	const { profile, isLoading } = useProfileContext();

	if (isLoading || !profile) {
		return (
			<div className={styles.loading}>
				<Spinner />
			</div>
		);
	}

	return (
		<main className={styles.page}>
			<h1 className={styles.title}>Paramètres</h1>
			{/* Sections added in later tasks */}
		</main>
	);
}
