import styles from './ForgeCardFrame.module.css';

export interface CardFrameProps {
	src: string;
	alt: string;
	width?: number;
	height?: number;
	className?: string;
	onClick?: () => void;
	glowColor?: string;
}

export function ForgeCardFrame({
	src,
	alt,
	width,
	height,
	className,
	onClick,
	glowColor,
}: CardFrameProps) {
	const hasFixedSize = width !== undefined && height !== undefined;
	return (
		<div
			className={`${styles.frame}${className ? ` ${className}` : ''}`}
			style={
				{
					...(hasFixedSize ? { width, height } : {}),
					'--glow-color': glowColor ?? 'var(--violet)',
				} as React.CSSProperties
			}
			onClick={onClick}
			role={onClick ? 'button' : undefined}
			tabIndex={onClick ? 0 : undefined}
		>
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
