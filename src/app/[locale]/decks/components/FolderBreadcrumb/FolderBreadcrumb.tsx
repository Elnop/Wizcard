'use client';

import { useTranslations } from 'next-intl';
import type { FolderMeta } from '@/types/decks';
import { getFolderAncestors } from '@/lib/deck/utils/folder-tree';
import styles from './FolderBreadcrumb.module.css';

type Props = {
	activeFolderId: string | 'none';
	folders: Record<string, FolderMeta>;
	onNavigate: (id: string | null | 'none') => void;
};

export function FolderBreadcrumb({ activeFolderId, folders, onNavigate }: Props) {
	const t = useTranslations('decks');
	if (activeFolderId === 'none') {
		return (
			<nav className={styles.breadcrumb} aria-label={t('breadcrumb')}>
				<button className={styles.crumb} onClick={() => onNavigate(null)}>
					{t('myDecks')}
				</button>
				<span className={styles.sep}>›</span>
				<span className={styles.current}>{t('noFolder')}</span>
			</nav>
		);
	}

	const ancestors = getFolderAncestors(activeFolderId, folders);
	const current = folders[activeFolderId];

	return (
		<nav className={styles.breadcrumb} aria-label={t('breadcrumb')}>
			<button className={styles.crumb} onClick={() => onNavigate(null)}>
				{t('myDecks')}
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
