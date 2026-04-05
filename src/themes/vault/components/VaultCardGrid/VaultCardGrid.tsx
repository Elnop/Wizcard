import styles from './VaultCardGrid.module.css';

export interface CardGridProps {
	children: React.ReactNode;
	columns?: number;
	className?: string;
}

export function VaultCardGrid({ children, columns = 4, className }: CardGridProps) {
	return (
		<div
			className={`${styles.grid}${className ? ` ${className}` : ''}`}
			style={{ '--columns': columns } as React.CSSProperties}
		>
			{children}
		</div>
	);
}
