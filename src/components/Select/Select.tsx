'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './Select.module.css';

export type SelectOption<T extends string> = { value: T; label: string };

type Props<T extends string> = {
	value: T;
	options: SelectOption<T>[];
	onChange: (value: T) => void;
	/** Accessible name for the trigger button (when no visible label wraps it). */
	ariaLabel?: string;
	className?: string;
	/** When true the trigger is inert and cannot be opened. */
	disabled?: boolean;
};

/**
 * Single-value dropdown styled to match the app's glass UI (see ContextMenu).
 * Unlike a native <select>, the open list is a fully styled portal panel, so it
 * stays consistent over the deck-detail cover background instead of falling back
 * to the opaque OS palette.
 */
export function Select<T extends string>({
	value,
	options,
	onChange,
	ariaLabel,
	className,
	disabled = false,
}: Props<T>) {
	const [open, setOpen] = useState(false);
	const [focusedIndex, setFocusedIndex] = useState(-1);
	const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const listId = useId();

	const selected = options.find((o) => o.value === value);
	const selectedIndex = options.findIndex((o) => o.value === value);

	const positionList = () => {
		const el = triggerRef.current;
		if (!el) return;
		const r = el.getBoundingClientRect();
		setRect({ left: r.left, top: r.bottom + 4, width: r.width });
	};

	// Position the portal panel under the trigger before paint to avoid a flash.
	useLayoutEffect(() => {
		if (open) positionList();
	}, [open]);

	const openList = () => {
		setFocusedIndex(selectedIndex);
		setOpen(true);
	};

	useEffect(() => {
		if (!open) return;

		const close = (e: Event) => {
			const target = e.target as Node;
			if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return;
			setOpen(false);
		};
		const onReposition = () => positionList();

		document.addEventListener('mousedown', close);
		window.addEventListener('resize', onReposition);
		// Capture scrolls anywhere so the panel follows / closes with the page.
		document.addEventListener('scroll', onReposition, true);
		return () => {
			document.removeEventListener('mousedown', close);
			window.removeEventListener('resize', onReposition);
			document.removeEventListener('scroll', onReposition, true);
		};
	}, [open]);

	const commit = (idx: number) => {
		const opt = options[idx];
		if (opt) onChange(opt.value);
		setOpen(false);
		triggerRef.current?.focus();
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Escape') {
			if (open) {
				e.preventDefault();
				setOpen(false);
			}
			return;
		}
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (!open) {
				openList();
				return;
			}
			setFocusedIndex((i) => Math.min(i + 1, options.length - 1));
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			if (!open) {
				openList();
				return;
			}
			setFocusedIndex((i) => Math.max(i - 1, 0));
		} else if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			if (!open) {
				openList();
			} else if (focusedIndex >= 0) {
				commit(focusedIndex);
			}
		}
	};

	return (
		<>
			<button
				ref={triggerRef}
				type="button"
				className={[styles.trigger, className].filter(Boolean).join(' ')}
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-label={ariaLabel}
				disabled={disabled}
				onClick={() => (open ? setOpen(false) : openList())}
				onKeyDown={handleKeyDown}
			>
				<span className={styles.triggerLabel}>{selected?.label ?? ''}</span>
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

			{open &&
				rect &&
				createPortal(
					<div
						ref={listRef}
						id={listId}
						role="listbox"
						className={styles.list}
						style={{ left: rect.left, top: rect.top, minWidth: rect.width }}
						onKeyDown={handleKeyDown}
					>
						{options.map((opt, idx) => (
							<div
								key={opt.value}
								role="option"
								aria-selected={opt.value === value}
								className={[
									styles.option,
									opt.value === value ? styles.optionSelected : '',
									idx === focusedIndex ? styles.optionFocused : '',
								]
									.filter(Boolean)
									.join(' ')}
								onMouseDown={(e) => {
									e.preventDefault();
									commit(idx);
								}}
								onMouseEnter={() => setFocusedIndex(idx)}
							>
								{opt.label}
							</div>
						))}
					</div>,
					document.body
				)}
		</>
	);
}
