'use client';

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { MPC_TAG_GROUPS } from '@/lib/mpc/mpc-tag-taxonomy';
import type { MpcTagNode, MpcTagGroup } from '@/lib/mpc/mpc-tag-taxonomy';
import styles from './TagInput.module.css';

interface FlatTag {
	label: string;
	group: string;
}

function flattenGroup(group: MpcTagGroup): FlatTag[] {
	function flattenNode(node: MpcTagNode): string[] {
		if (!node.children?.length) return [node.label];
		return [node.label, ...node.children.flatMap(flattenNode)];
	}
	return group.tags.flatMap(flattenNode).map((label) => ({ label, group: group.label }));
}

const ALL_TAGS: FlatTag[] = MPC_TAG_GROUPS.flatMap(flattenGroup);

function filterSuggestions(query: string, exclude: string[]): FlatTag[] {
	const q = query.toLowerCase().trim();
	return ALL_TAGS.filter(
		(t) => !exclude.includes(t.label) && (q === '' || t.label.toLowerCase().includes(q))
	);
}

export interface TagInputProps {
	selected: string[];
	onAdd: (tag: string) => void;
	onRemove: (tag: string) => void;
	placeholder: string;
	otherSelected?: string[];
	allowFreeText?: boolean;
	removeLabel: string;
	variant?: 'include' | 'exclude' | 'neutral';
	emptyLabel?: string;
	addLabel?: (query: string) => string;
}

export function TagInput({
	selected,
	onAdd,
	onRemove,
	placeholder,
	otherSelected = [],
	allowFreeText = false,
	removeLabel,
	variant = 'neutral',
	emptyLabel = 'No tag found',
	addLabel = (q) => `Add "${q}"`,
}: TagInputProps) {
	const [query, setQuery] = useState('');
	const [open, setOpen] = useState(false);
	const [focusedIndex, setFocusedIndex] = useState(-1);
	const [addCount, setAddCount] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	const excluded = [...selected, ...otherSelected];
	const suggestions = filterSuggestions(query, excluded);

	let chipClass = styles.chipNeutral;
	if (variant === 'include') chipClass = styles.chipInclude;
	else if (variant === 'exclude') chipClass = styles.chipExclude;

	let inputVariantClass = '';
	if (variant === 'include') inputVariantClass = styles.inputInclude;
	else if (variant === 'exclude') inputVariantClass = styles.inputExclude;

	const handleAdd = useCallback(
		(tag: string) => {
			const normalized = tag.trim();
			if (!normalized) return;
			onAdd(normalized);
			setQuery('');
			setFocusedIndex(-1);
			setAddCount((n) => n + 1);
		},
		[onAdd]
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

	// Restore focus to the input after a tag is added (via click or Enter).
	// useLayoutEffect keeps this synchronous with the DOM update, matching the
	// original inline `inputRef.current?.focus()` call inside the event handler.
	useLayoutEffect(() => {
		if (addCount > 0) {
			inputRef.current?.focus();
		}
	}, [addCount]);

	function handleKeyDown(e: React.KeyboardEvent) {
		if (!open) {
			if (e.key === 'ArrowDown' || e.key === 'Enter') setOpen(true);
			return;
		}
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			setFocusedIndex((i) => Math.min(i + 1, suggestions.length - 1));
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			setFocusedIndex((i) => Math.max(i - 1, 0));
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (focusedIndex >= 0 && suggestions[focusedIndex]) {
				handleAdd(suggestions[focusedIndex].label);
			} else if (allowFreeText && query.trim()) {
				// No suggestion focused: add the typed tag verbatim.
				handleAdd(query);
			}
		} else if (e.key === 'Escape') {
			setOpen(false);
		} else if (e.key === 'Backspace' && query === '' && selected.length > 0) {
			onRemove(selected[selected.length - 1]);
		}
	}

	const grouped: { group: string; items: FlatTag[] }[] = [];
	for (const tag of suggestions) {
		const last = grouped[grouped.length - 1];
		if (last && last.group === tag.group) {
			last.items.push(tag);
		} else {
			grouped.push({ group: tag.group, items: [tag] });
		}
	}

	function renderEmptyState() {
		if (allowFreeText && query.trim()) {
			return (
				<div
					role="option"
					aria-selected={false}
					className={styles.dropdownItem}
					onMouseDown={(e) => {
						e.preventDefault();
						handleAdd(query);
					}}
				>
					{addLabel(query.trim())}
				</div>
			);
		}
		return <div className={styles.dropdownEmpty}>{emptyLabel}</div>;
	}

	return (
		<div className={styles.root}>
			{selected.length > 0 && (
				<div className={styles.chips}>
					{selected.map((tag) => (
						<span key={tag} className={`${styles.chip} ${chipClass}`}>
							{tag}
							<button
								type="button"
								className={styles.chipRemove}
								onClick={() => onRemove(tag)}
								aria-label={`${removeLabel} ${tag}`}
							>
								×
							</button>
						</span>
					))}
				</div>
			)}

			<div className={styles.inputWrap} ref={containerRef}>
				<input
					ref={inputRef}
					type="text"
					className={`${styles.input} ${inputVariantClass}`}
					placeholder={placeholder}
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
						{suggestions.length === 0
							? renderEmptyState()
							: grouped.map(({ group, items }) => (
									<div key={group}>
										<div className={styles.dropdownItemGroup}>{group}</div>
										{items.map((tag) => {
											const idx = suggestions.indexOf(tag);
											return (
												<div
													key={tag.label}
													role="option"
													aria-selected={false}
													className={`${styles.dropdownItem} ${focusedIndex === idx ? styles.dropdownItemFocused : ''}`}
													onMouseDown={(e) => {
														e.preventDefault();
														handleAdd(tag.label);
													}}
													onMouseEnter={() => setFocusedIndex(idx)}
												>
													{tag.label}
												</div>
											);
										})}
									</div>
								))}
					</div>
				)}
			</div>
		</div>
	);
}
