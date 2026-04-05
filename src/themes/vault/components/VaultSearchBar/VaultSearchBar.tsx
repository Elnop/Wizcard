'use client';

import { type ChangeEvent } from 'react';
import styles from './VaultSearchBar.module.css';

export interface SearchBarProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
}

export function VaultSearchBar({
	value,
	onChange,
	placeholder = 'Search cards...',
}: SearchBarProps) {
	const handleChange = (e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value);
	const handleClear = () => onChange('');

	return (
		<div className={styles.container}>
			<svg
				className={styles.icon}
				xmlns="http://www.w3.org/2000/svg"
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<circle cx="11" cy="11" r="8" />
				<path d="m21 21-4.35-4.35" />
			</svg>
			<input
				type="text"
				className={styles.input}
				value={value}
				onChange={handleChange}
				placeholder={placeholder}
				autoComplete="off"
				autoCorrect="off"
				spellCheck={false}
			/>
			{value && (
				<button
					type="button"
					className={styles.clearButton}
					onClick={handleClear}
					aria-label="Clear search"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M18 6 6 18" />
						<path d="m6 6 12 12" />
					</svg>
				</button>
			)}
		</div>
	);
}
