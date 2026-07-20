import styles from './CardFanBackdrop.module.css';

export function CardFanBackdrop() {
	return (
		<div className={styles.container}>
			<div className={styles.glow} />
			<div className={styles.fan}>
				<div className={styles.card} />
				<div className={styles.card} />
				<div className={styles.card} />
				<div className={styles.card} />
				<div className={styles.card} />
			</div>
		</div>
	);
}
