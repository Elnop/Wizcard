import { useTranslations } from 'next-intl';
import type { CustomCard } from '@/lib/mpc/types';
import styles from './CustomCardSection.module.css';

export function CustomCardSection({ card }: { card: CustomCard }) {
	const t = useTranslations('card');
	const m = card.custom;
	const cardTypeLabel =
		m.card_type === 'card' || m.card_type === 'token' || m.card_type === 'cardback'
			? t(`customType.${m.card_type}`)
			: m.card_type;
	const sourceTypeLabel =
		m.source_type === 'mpc_ingested' || m.source_type === 'user_created'
			? t(`customSource.${m.source_type}`)
			: m.source_type;
	return (
		<div className={styles.section}>
			<div className={styles.sectionTitle}>{t('customTitle')}</div>

			<div className={styles.badgeRow}>
				<span className={styles.badge}>{cardTypeLabel}</span>
				<span className={styles.badgeSecondary}>{sourceTypeLabel}</span>
			</div>

			{m.source_name && (
				<div className={styles.row}>
					<span className={styles.label}>{t('source')}</span>
					{m.source_type === 'mpc_ingested' && m.source_drive_folder_id ? (
						<a
							className={styles.value}
							href={`https://drive.google.com/drive/folders/${m.source_drive_folder_id}`}
							target="_blank"
							rel="noopener noreferrer"
						>
							{m.source_name}
						</a>
					) : (
						<span className={styles.value}>{m.source_name}</span>
					)}
				</div>
			)}

			{m.set_code && (
				<div className={styles.row}>
					<span className={styles.label}>{t('detailSet')}</span>
					<span className={styles.value}>
						{m.set_code.toUpperCase()}
						{m.collector_number ? ` #${m.collector_number}` : ''}
					</span>
				</div>
			)}

			{m.lang && (
				<div className={styles.row}>
					<span className={styles.label}>{t('detailLanguage')}</span>
					<span className={styles.value}>{m.lang}</span>
				</div>
			)}

			{m.tags.length > 0 && (
				<div className={styles.chipGroup}>
					<span className={styles.label}>{t('tags')}</span>
					<div className={styles.chips}>
						{m.tags.map((tag) => (
							<span key={tag} className={styles.chip}>
								{tag}
							</span>
						))}
					</div>
				</div>
			)}

			<details className={styles.rawName}>
				<summary className={styles.rawNameSummary}>{t('file')}</summary>
				{m.source_type === 'mpc_ingested' && m.source_drive_folder_id ? (
					<a
						className={styles.rawNameValue}
						href={`https://drive.google.com/drive/folders/${m.source_drive_folder_id}`}
						target="_blank"
						rel="noopener noreferrer"
					>
						{[m.drive_folder_path, m.raw_name].filter(Boolean).join(' / ')}
					</a>
				) : (
					<code className={styles.rawNameValue}>{m.raw_name}</code>
				)}
			</details>
		</div>
	);
}
