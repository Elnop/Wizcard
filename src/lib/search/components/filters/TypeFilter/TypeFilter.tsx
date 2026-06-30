'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useScryfallCardTypes } from '@/lib/scryfall/hooks/useScryfallCardTypes';
import styles from './TypeFilter.module.css';

export interface TypeFilterProps {
	value: string[];
	onChange: (value: string[]) => void;
}

const MAX_SUGGESTIONS = 50;

function filterSuggestions(query: string, all: string[], exclude: string[]): string[] {
	const q = query.toLowerCase().trim();
	const excludeLower = exclude.map((t) => t.toLowerCase());
	return all
		.filter(
			(t) => !excludeLower.includes(t.toLowerCase()) && (q === '' || t.toLowerCase().includes(q))
		)
		.slice(0, MAX_SUGGESTIONS);
}

export function TypeFilter({ value, onChange }: TypeFilterProps) {
	const { cardTypes, isLoading } = useScryfallCardTypes();
	const [query, setQuery] = useState('');
	const [open, setOpen] = useState(false);
	const [focusedIndex, setFocusedIndex] = useState(-1);
	const inputRef = useRef<HTMLInputElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	const suggestions = filterSuggestions(query, cardTypes, value);

	const handleAdd = useCallback(
		(type: string) => {
			const trimmed = type.trim();
			if (!trimmed) return;
			// Avoid duplicates (case-insensitive).
			if (value.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
				setQuery('');
				setFocusedIndex(-1);
				return;
			}
			onChange([...value, trimmed]);
			setQuery('');
			setFocusedIndex(-1);
			inputRef.current?.focus();
		},
		[value, onChange]
	);

	const handleRemove = useCallback(
		(type: string) => {
			onChange(value.filter((t) => t !== type));
		},
		[value, onChange]
	);

	useEffect(() => {
		if (!open) return;
		function handleClick(e: MouseEvent) {
			if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
				setOpen(false);
			}
		}
		document.addEventListener('mousedown', handleClick);
		return () => document.removeEventListener('mousedown', handleClick);
	}, [open]);

	function handleKeyDown(e: React.KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			setOpen(true);
			setFocusedIndex((i) => Math.min(i + 1, suggestions.length - 1));
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			setFocusedIndex((i) => Math.max(i - 1, 0));
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (focusedIndex >= 0 && suggestions[focusedIndex]) {
				handleAdd(suggestions[focusedIndex]);
			} else if (query.trim()) {
				// Free text: add whatever the user typed, even if not in the catalog.
				handleAdd(query);
			}
		} else if (e.key === 'Escape') {
			setOpen(false);
		} else if (e.key === 'Backspace' && query === '' && value.length > 0) {
			handleRemove(value[value.length - 1]);
		}
	}

	return (
		<div className={styles.filterGroup} ref={containerRef}>
			<label className={styles.label}>Type</label>

			{value.length > 0 && (
				<div className={styles.chips}>
					{value.map((type) => (
						<span key={type} className={styles.chip}>
							{type}
							<button
								type="button"
								className={styles.chipRemove}
								onClick={() => handleRemove(type)}
								aria-label={`Remove ${type}`}
							>
								×
							</button>
						</span>
					))}
				</div>
			)}

			<div className={styles.inputWrap}>
				<input
					ref={inputRef}
					type="text"
					className={styles.input}
					placeholder={isLoading ? 'Loading types…' : 'Type or subtype (Cat, Goblin…)'}
					value={query}
					onChange={(e) => {
						setQuery(e.target.value);
						setFocusedIndex(-1);
						setOpen(true);
					}}
					onFocus={() => setOpen(true)}
					onKeyDown={handleKeyDown}
					autoComplete="off"
				/>

				{open && (
					<div className={styles.dropdown} role="listbox">
						{suggestions.length === 0 ? (
							<div className={styles.dropdownEmpty}>
								{query.trim() ? 'Enter to add this term' : 'No type found'}
							</div>
						) : (
							suggestions.map((type, idx) => (
								<div
									key={type}
									role="option"
									aria-selected={false}
									className={`${styles.dropdownItem} ${focusedIndex === idx ? styles.dropdownItemFocused : ''}`}
									onMouseDown={(e) => {
										e.preventDefault();
										handleAdd(type);
									}}
									onMouseEnter={() => setFocusedIndex(idx)}
								>
									{type}
								</div>
							))
						)}
					</div>
				)}
			</div>
		</div>
	);
}
