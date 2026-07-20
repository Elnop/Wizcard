'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

// Progress of a tall "pinned" block: 0 when its top hits the viewport top,
// 1 when its bottom reaches the viewport bottom (i.e. the sticky child has
// finished its travel). Read on a rAF so scroll never blocks on layout.
//
// `leadIn` (px) starts the ramp BEFORE the block is pinned — while it is still
// sliding up into view. Without it the first section after the hero shows a
// frozen demo for a full viewport of scrolling (the block is on screen but its
// top has not reached 0 yet), which reads as "the section got skipped".
export function useScrollProgress(ref: RefObject<HTMLElement | null>, leadIn = 0): number {
	const [progress, setProgress] = useState(0);
	const frame = useRef<number | null>(null);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;

		const compute = () => {
			frame.current = null;
			const rect = el.getBoundingClientRect();
			const travel = rect.height - window.innerHeight;
			if (travel <= 0) {
				setProgress(rect.top <= 0 ? 1 : 0);
				return;
			}
			// rect.top goes from +leadIn (block still entering) through 0 (pinned)
			// down to -travel (finished). Shift the origin up by `leadIn` so the
			// ramp has already begun by the time the block pins.
			const p = Math.min(1, Math.max(0, (leadIn - rect.top) / (travel + leadIn)));
			setProgress(p);
		};

		const onScroll = () => {
			if (frame.current !== null) return;
			frame.current = requestAnimationFrame(compute);
		};

		compute();
		window.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('resize', onScroll);
		return () => {
			window.removeEventListener('scroll', onScroll);
			window.removeEventListener('resize', onScroll);
			if (frame.current !== null) cancelAnimationFrame(frame.current);
		};
	}, [ref, leadIn]);

	return progress;
}
