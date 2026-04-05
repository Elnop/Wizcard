import styles from './LibrarySpinner.module.css';

export interface SpinnerProps {
	size?: 'sm' | 'md' | 'lg';
	className?: string;
}

export function LibrarySpinner({ size = 'md', className }: SpinnerProps) {
	const classNames = [styles.spinner, styles[size], className].filter(Boolean).join(' ');
	return (
		<div className={classNames} role="status" aria-label="Loading">
			<span className={styles.srOnly}>Loading...</span>
		</div>
	);
}
