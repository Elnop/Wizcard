'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SetGroup } from '@/lib/scryfall/utils/set-classification';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { ScryfallSortOrder, ScryfallSortDir } from '@/lib/scryfall/types/sort';
import { SetCardsGrid } from '../SetCardsGrid/SetCardsGrid';
import styles from './SetTabs.module.css';

export interface SetTabsProps {
	group: SetGroup;
	activeId: string;
	onTabChange: (code: string) => void;
	/** Cards to render (already filtered/sorted at the page level). */
	cards: ScryfallCard[];
	isCompletionLoading: boolean;
	sortOrder: ScryfallSortOrder;
	sortDir: ScryfallSortDir;
	onSortChange: (order: ScryfallSortOrder, dir: ScryfallSortDir) => void;
}

export function SetTabs({
	group,
	activeId,
	onTabChange,
	cards,
	isCompletionLoading,
	sortOrder,
	sortDir,
	onSortChange,
}: SetTabsProps) {
	const tabs = group.sets;

	const listRef = useRef<HTMLDivElement>(null);
	const [overflow, setOverflow] = useState({ left: false, right: false });
	// Pointer drag-to-scroll state (mouse held down and moving horizontally).
	const drag = useRef({ active: false, moved: false, startX: 0, startScroll: 0 });

	const updateOverflow = useCallback(() => {
		const el = listRef.current;
		if (!el) return;
		const maxScroll = el.scrollWidth - el.clientWidth;
		const next = { left: el.scrollLeft > 1, right: el.scrollLeft < maxScroll - 1 };
		// Only update state when a boolean actually flips, otherwise every scroll
		// frame would re-render the whole grid (making the cards flicker).
		setOverflow((prev) => (prev.left === next.left && prev.right === next.right ? prev : next));
	}, []);

	useEffect(() => {
		updateOverflow();
		const el = listRef.current;
		if (!el) return;
		const ro = new ResizeObserver(updateOverflow);
		ro.observe(el);
		window.addEventListener('resize', updateOverflow);
		return () => {
			ro.disconnect();
			window.removeEventListener('resize', updateOverflow);
		};
	}, [updateOverflow, tabs.length]);

	// Keep the active tab in view (e.g. after navigating to a derived set directly).
	useEffect(() => {
		const el = listRef.current;
		const active = el?.querySelector<HTMLElement>('[data-active="true"]');
		active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}, [activeId]);

	// Vertical wheel → horizontal scroll, so the trackpad/mouse wheel moves the strip.
	const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
		const el = listRef.current;
		if (!el || el.scrollWidth <= el.clientWidth) return;
		if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
			el.scrollLeft += e.deltaY;
		}
	};

	const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		const el = listRef.current;
		if (!el) return;
		drag.current = { active: true, moved: false, startX: e.clientX, startScroll: el.scrollLeft };
	};

	const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		const el = listRef.current;
		if (!el || !drag.current.active) return;
		const dx = e.clientX - drag.current.startX;
		if (Math.abs(dx) > 3) drag.current.moved = true;
		el.scrollLeft = drag.current.startScroll - dx;
	};

	const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
		if (drag.current.active && drag.current.moved) {
			// Swallow the click that follows a drag so it doesn't switch tab.
			e.currentTarget.releasePointerCapture?.(e.pointerId);
		}
		drag.current.active = false;
	};

	// Suppress the click fired at the end of a drag (otherwise a drag selects a tab).
	const handleTabClickCapture = (e: React.MouseEvent) => {
		if (drag.current.moved) {
			e.stopPropagation();
			e.preventDefault();
			drag.current.moved = false;
		}
	};

	return (
		<div className={styles.wrapper}>
			<div
				className={styles.tabBar}
				data-overflow-left={overflow.left}
				data-overflow-right={overflow.right}
			>
				<div
					className={styles.tabList}
					role="tablist"
					ref={listRef}
					onScroll={updateOverflow}
					onWheel={handleWheel}
					onPointerDown={handlePointerDown}
					onPointerMove={handlePointerMove}
					onPointerUp={endDrag}
					onPointerLeave={endDrag}
					onClickCapture={handleTabClickCapture}
				>
					{tabs.map((set) => (
						<button
							key={set.code}
							role="tab"
							type="button"
							className={styles.tab}
							data-active={activeId === set.code}
							aria-selected={activeId === set.code}
							onClick={() => onTabChange(set.code)}
						>
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img src={set.icon_svg_uri} alt="" className={styles.tabIcon} draggable={false} />
							<span className={styles.tabName}>{set.name}</span>
							<span className={styles.tabCode}>{set.code.toUpperCase()}</span>
						</button>
					))}
				</div>
			</div>

			<SetCardsGrid
				key={activeId}
				cards={cards}
				isLoading={isCompletionLoading}
				sortOrder={sortOrder}
				sortDir={sortDir}
				onSortChange={onSortChange}
			/>
		</div>
	);
}
