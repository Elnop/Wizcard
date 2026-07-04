'use client';

import { useEffect, useState } from 'react';

/**
 * Returns `true` while the sticky header should stay visible, `false` while it
 * should hide. Hides when the user scrolls DOWN past `threshold`, reappears on
 * any upward scroll. Near the very top it's always visible.
 */
export function useHideOnScrollDown(threshold = 120): boolean {
	const [visible, setVisible] = useState(true);

	useEffect(() => {
		let lastY = window.scrollY;
		let ticking = false;

		const update = () => {
			const y = window.scrollY;
			const delta = y - lastY;
			// Ignore tiny jitters; require a small movement to flip state.
			if (Math.abs(delta) > 6) {
				if (y < threshold) {
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

		window.addEventListener('scroll', onScroll, { passive: true });
		return () => window.removeEventListener('scroll', onScroll);
	}, [threshold]);

	return visible;
}
