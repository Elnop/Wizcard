import type { CustomCard } from '@/lib/mpc/types';
import styles from './CustomCardSection.module.css';

const CARD_TYPE_LABELS: Record<string, string> = {
	card: 'Card',
	token: 'Token',
	cardback: 'Cardback',
};

const SOURCE_TYPE_LABELS: Record<string, string> = {
	mpc_ingested: 'MPC',
	user_created: 'User Created',
};

export function CustomCardSection({ card }: { card: CustomCard }) {
	const m = card.custom;
	return (
		<div className={styles.section}>
			<div className={styles.sectionTitle}>Carte Custom</div>

			<div className={styles.badgeRow}>
				<span className={styles.badge}>{CARD_TYPE_LABELS[m.card_type] ?? m.card_type}</span>
				<span className={styles.badgeSecondary}>
					{SOURCE_TYPE_LABELS[m.source_type] ?? m.source_type}
				</span>
			</div>

			{m.source_name && (
				<div className={styles.row}>
					<span className={styles.label}>Source</span>
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
					<span className={styles.label}>Set</span>
					<span className={styles.value}>
						{m.set_code.toUpperCase()}
						{m.collector_number ? ` #${m.collector_number}` : ''}
					</span>
				</div>
			)}

			{m.lang && (
				<div className={styles.row}>
					<span className={styles.label}>Langue</span>
					<span className={styles.value}>{m.lang}</span>
				</div>
			)}

			{m.tags.length > 0 && (
				<div className={styles.chipGroup}>
					<span className={styles.label}>Tags</span>
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
				<summary className={styles.rawNameSummary}>Fichier</summary>
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
