'use client';

import { useEffect, useState, type RefObject } from 'react';

export type StickyHeaderState = {
	/** Header should be pinned (fixed) rather than in normal flow. */
	pinned: boolean;
	/** Header is currently shown (vs hidden by scrolling down). */
	visible: boolean;
	/** Height of the header, for the in-flow spacer that prevents content jump. */
	height: number;
};

/**
 * Drives an app-style reappearing header for the element in `ref`:
 * - in normal flow near the top,
 * - once scrolled past, it pins (fixed) below the navbar,
 * - hides when scrolling DOWN, reappears on scrolling UP.
 *
 * Reads the scroll position from whichever element actually scrolls and listens
 * in the capture phase, so it works even when overflow on html/body moves the
 * scroller off `window` (and `position: sticky` can't be relied on).
 */
export function useStickyHeader(ref: RefObject<HTMLElement | null>): StickyHeaderState {
	const [pinned, setPinned] = useState(false);
	const [visible, setVisible] = useState(true);
	const [height, setHeight] = useState(0);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;

		const readScrollY = () =>
			window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;

		// The point at which the header would scroll out of view = its offset from
		// the top of the document.
		let pinAt = el.offsetTop;
		const measure = () => {
			setHeight(el.offsetHeight);
			pinAt = el.offsetTop;
		};
		measure();

		let lastY = readScrollY();
		let ticking = false;

		const update = () => {
			const y = readScrollY();
			const delta = y - lastY;

			// Pin once we've scrolled past where the header naturally sits.
			setPinned(y > pinAt);

			if (Math.abs(delta) > 6) {
				if (y <= pinAt) {
					setVisible(true);
				} else if (delta > 0) {
					setVisible(false); // scrolling down
				} else {
					setVisible(true); // scrolling up
				}
				lastY = y;
			}
			ticking = false;
		};

		const onScroll = () => {
			if (!ticking) {
				ticking = true;
				requestAnimationFrame(update);
			}
		};

		window.addEventListener('scroll', onScroll, { passive: true, capture: true });
		window.addEventListener('resize', measure);
		return () => {
			window.removeEventListener('scroll', onScroll, { capture: true });
			window.removeEventListener('resize', measure);
		};
	}, [ref]);

	return { pinned, visible, height };
}
