'use client';

import { useState, useRef, useEffect } from 'react';
import type { MpcSourceWithCount } from '@/lib/mpc/db/custom-cards';
import styles from './CustomSourceFilter.module.css';

interface CustomSourceFilterProps {
	sources: MpcSourceWithCount[];
	value: string | null;
	onChange: (sourceId: string | null) => void;
}

export function CustomSourceFilter({ sources, value, onChange }: CustomSourceFilterProps) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState('');
	const containerRef = useRef<HTMLDivElement>(null);

	const selectedSource = sources.find((s) => s.id === value);

	const filtered = search
		? sources.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
		: sources;

	useEffect(() => {
		if (!open) return;
		function handleClickOutside(e: MouseEvent) {
			if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
				setOpen(false);
			}
		}
		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, [open]);

	function handleSelect(id: string | null) {
		onChange(id);
		setOpen(false);
		setSearch('');
	}

	return (
		<div className={styles.container} ref={containerRef}>
			<span className={styles.label}>Créateur</span>
			<button
				type="button"
				className={styles.trigger}
				onClick={() => setOpen((v) => !v)}
				aria-haspopup="listbox"
				aria-expanded={open}
			>
				<span className={styles.triggerText}>{selectedSource ? selectedSource.name : 'Tous'}</span>
				<svg
					className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
				>
					<path d="m6 9 6 6 6-6" />
				</svg>
			</button>

			{open && (
				<div className={styles.dropdown} role="listbox">
					<div className={styles.searchWrapper}>
						<input
							type="text"
							className={styles.searchInput}
							placeholder="Rechercher..."
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							autoFocus
						/>
					</div>
					<ul className={styles.list}>
						<li
							className={`${styles.option} ${value === null ? styles.optionSelected : ''}`}
							role="option"
							aria-selected={value === null}
							onClick={() => handleSelect(null)}
						>
							Tous
						</li>
						{filtered.map((source) => (
							<li
								key={source.id}
								className={`${styles.option} ${value === source.id ? styles.optionSelected : ''}`}
								role="option"
								aria-selected={value === source.id}
								onClick={() => handleSelect(source.id)}
							>
								{source.name} <span className={styles.count}>({source.cardCount})</span>
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}
