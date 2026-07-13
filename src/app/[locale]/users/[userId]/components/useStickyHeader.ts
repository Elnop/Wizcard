'use client';

import { useEffect, useState, type RefObject } from 'react';

export type StickyHeaderState = {
	/** True once scrolled past the in-flow header (the overlay header may show). */
	pinned: boolean;
	/** While pinned: true = show the overlay header, false = hide it (scroll down). */
	visible: boolean;
};

/**
 * Drives a second, overlay header that only engages BELOW the in-flow header in
 * `ref`. The normal header stays at the top of the page (no animation); the
 * overlay only appears once scrolled past it, hiding on scroll DOWN and
 * reappearing on scroll UP. Keeping the two separate avoids the jitter a single
 * element gets from small scrolls near the top.
 *
 * Reads scroll from whichever element actually scrolls and listens in the
 * capture phase, so it works even when overflow on html/body moves the scroller
 * off `window`.
 */
export function useStickyHeader(ref: RefObject<HTMLElement | null>): StickyHeaderState {
	const [pinned, setPinned] = useState(false);
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;

		const readScrollY = () =>
			window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;

		// Engage the overlay only once scrolled past the in-flow header's bottom.
		let pinAt = el.offsetTop + el.offsetHeight;
		const measure = () => {
			pinAt = el.offsetTop + el.offsetHeight;
		};
		measure();

		let lastY = readScrollY();
		let ticking = false;

		const update = () => {
			const y = readScrollY();
			const delta = y - lastY;

			if (y <= pinAt) {
				// Above the threshold: only the in-flow header shows, overlay is off.
				setPinned(false);
				setVisible(false);
			} else {
				setPinned(true);
				if (Math.abs(delta) > 6) {
					setVisible(delta < 0); // show when scrolling up, hide when down
				}
			}
			lastY = y;
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

	return { pinned, visible };
}
