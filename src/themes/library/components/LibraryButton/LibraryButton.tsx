'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import styles from './LibraryButton.module.css';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
	size?: 'sm' | 'md' | 'lg';
	children: ReactNode;
	isLoading?: boolean;
}

export const LibraryButton = forwardRef<HTMLButtonElement, ButtonProps>(
	(
		{ variant = 'primary', size = 'md', children, isLoading, className, disabled, ...props },
		ref
	) => {
		const classNames = [
			styles.button,
			styles[variant],
			styles[size],
			isLoading ? styles.loading : '',
			className ?? '',
		]
			.filter(Boolean)
			.join(' ');

		return (
			<button ref={ref} className={classNames} disabled={disabled || isLoading} {...props}>
				{isLoading ? <span className={styles.spinner} /> : children}
			</button>
		);
	}
);

LibraryButton.displayName = 'LibraryButton';
