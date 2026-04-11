'use client';

import type { FolderMeta } from '@/types/decks';
import { getFolderAncestors } from '@/lib/deck/utils/folder-tree';
import styles from './FolderBreadcrumb.module.css';

type Props = {
	activeFolderId: string | 'none';
	folders: Record<string, FolderMeta>;
	onNavigate: (id: string | null | 'none') => void;
};

export function FolderBreadcrumb({ activeFolderId, folders, onNavigate }: Props) {
	if (activeFolderId === 'none') {
		return (
			<nav className={styles.breadcrumb} aria-label="Breadcrumb">
				<button className={styles.crumb} onClick={() => onNavigate(null)}>
					My Decks
				</button>
				<span className={styles.sep}>›</span>
				<span className={styles.current}>Sans dossier</span>
			</nav>
		);
	}

	const ancestors = getFolderAncestors(activeFolderId, folders);
	const current = folders[activeFolderId];

	return (
		<nav className={styles.breadcrumb} aria-label="Breadcrumb">
			<button className={styles.crumb} onClick={() => onNavigate(null)}>
				My Decks
			</button>
			{ancestors.map((ancestor) => (
				<>
					<span key={`sep-${ancestor.id}`} className={styles.sep}>
						›
					</span>
					<button
						key={ancestor.id}
						className={styles.crumb}
						onClick={() => onNavigate(ancestor.id)}
					>
						{ancestor.name}
					</button>
				</>
			))}
			<span className={styles.sep}>›</span>
			<span className={styles.current}>{current?.name ?? '...'}</span>
		</nav>
	);
}
