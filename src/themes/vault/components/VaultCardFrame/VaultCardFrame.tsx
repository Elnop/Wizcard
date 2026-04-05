import styles from './VaultCardFrame.module.css';

export interface CardFrameProps {
	src: string;
	alt: string;
	width?: number;
	height?: number;
	className?: string;
	onClick?: () => void;
}

export function VaultCardFrame({ src, alt, width, height, className, onClick }: CardFrameProps) {
	const hasFixedSize = width !== undefined && height !== undefined;
	return (
		<div
			className={`${styles.frame}${className ? ` ${className}` : ''}`}
			style={hasFixedSize ? { width, height } : undefined}
			onClick={onClick}
			role={onClick ? 'button' : undefined}
			tabIndex={onClick ? 0 : undefined}
		>
			<div className={styles.cornerTL} />
			<div className={styles.cornerTR} />
			<div className={styles.cornerBL} />
			<div className={styles.cornerBR} />
			{/* eslint-disable-next-line @next/next/no-img-element */}
			<img
				src={src}
				alt={alt}
				className={styles.image}
				loading="lazy"
				width={width ?? 488}
				height={height ?? 680}
			/>
		</div>
	);
}
