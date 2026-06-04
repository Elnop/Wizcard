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
					<span className={styles.value}>{m.source_name}</span>
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

			{m.variants.length > 0 && (
				<div className={styles.chipGroup}>
					<span className={styles.label}>Variants</span>
					<div className={styles.chips}>
						{m.variants.map((v) => (
							<span key={v} className={styles.chip}>
								{v}
							</span>
						))}
					</div>
				</div>
			)}

			<details className={styles.rawName}>
				<summary className={styles.rawNameSummary}>Filename</summary>
				<code className={styles.rawNameValue}>{m.raw_name}</code>
			</details>
		</div>
	);
}
