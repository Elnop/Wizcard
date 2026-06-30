'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MPC_TAG_GROUPS } from '@/lib/mpc/mpc-tag-taxonomy';
import type { MpcTagNode, MpcTagGroup } from '@/lib/mpc/mpc-tag-taxonomy';
import styles from './MpcTagsFilter.module.css';

export interface MpcTagsFilterValue {
	mustHave: string[];
	mustNotHave: string[];
}

interface MpcTagsFilterProps {
	value: MpcTagsFilterValue;
	onChange: (value: MpcTagsFilterValue) => void;
}

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

interface TagInputProps {
	listId: 'mustHave' | 'mustNotHave';
	selected: string[];
	otherSelected: string[];
	onAdd: (tag: string) => void;
	onRemove: (tag: string) => void;
	label: string;
	placeholder: string;
}

function TagInput({
	listId,
	selected,
	otherSelected,
	onAdd,
	onRemove,
	label,
	placeholder,
}: TagInputProps) {
	const [query, setQuery] = useState('');
	const [open, setOpen] = useState(false);
	const [focusedIndex, setFocusedIndex] = useState(-1);
	const inputRef = useRef<HTMLInputElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	const excluded = [...selected, ...otherSelected];
	const suggestions = filterSuggestions(query, excluded);

	const isInclude = listId === 'mustHave';

	const handleAdd = useCallback(
		(tag: string) => {
			onAdd(tag);
			setQuery('');
			setFocusedIndex(-1);
			inputRef.current?.focus();
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
		} else if (e.key === 'Enter' && focusedIndex >= 0 && suggestions[focusedIndex]) {
			e.preventDefault();
			handleAdd(suggestions[focusedIndex].label);
		} else if (e.key === 'Escape') {
			setOpen(false);
		} else if (e.key === 'Backspace' && query === '' && selected.length > 0) {
			onRemove(selected[selected.length - 1]);
		}
	}

	// Group suggestions for display
	const grouped: { group: string; items: FlatTag[] }[] = [];
	for (const tag of suggestions) {
		const last = grouped[grouped.length - 1];
		if (last && last.group === tag.group) {
			last.items.push(tag);
		} else {
			grouped.push({ group: tag.group, items: [tag] });
		}
	}

	return (
		<div className={styles.section}>
			<div
				className={`${styles.sectionLabel} ${isInclude ? styles.sectionLabelInclude : styles.sectionLabelExclude}`}
			>
				{label}
			</div>

			{selected.length > 0 && (
				<div className={styles.chips}>
					{selected.map((tag) => (
						<span
							key={tag}
							className={`${styles.chip} ${isInclude ? styles.chipInclude : styles.chipExclude}`}
						>
							{tag}
							<button
								type="button"
								className={styles.chipRemove}
								onClick={() => onRemove(tag)}
								aria-label={`Remove ${tag}`}
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
					className={`${styles.input} ${isInclude ? styles.inputInclude : styles.inputExclude}`}
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
						{suggestions.length === 0 ? (
							<div className={styles.dropdownEmpty}>No tag found</div>
						) : (
							grouped.map(({ group, items }) => (
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
							))
						)}
					</div>
				)}
			</div>
		</div>
	);
}

export function MpcTagsFilter({ value, onChange }: MpcTagsFilterProps) {
	const { mustHave, mustNotHave } = value;

	return (
		<div className={styles.root}>
			<div className={styles.header}>Tags MPC</div>
			<TagInput
				listId="mustHave"
				selected={mustHave}
				otherSelected={mustNotHave}
				onAdd={(tag) => onChange({ mustHave: [...mustHave, tag], mustNotHave })}
				onRemove={(tag) => onChange({ mustHave: mustHave.filter((t) => t !== tag), mustNotHave })}
				label="Must have at least one of"
				placeholder="Search a tag…"
			/>
			<TagInput
				listId="mustNotHave"
				selected={mustNotHave}
				otherSelected={mustHave}
				onAdd={(tag) => onChange({ mustHave, mustNotHave: [...mustNotHave, tag] })}
				onRemove={(tag) =>
					onChange({ mustHave, mustNotHave: mustNotHave.filter((t) => t !== tag) })
				}
				label="Ne doit pas avoir"
				placeholder="Search a tag…"
			/>
		</div>
	);
}
