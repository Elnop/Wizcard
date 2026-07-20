'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

// Progress of a tall "pinned" block: 0 when its top hits the viewport top,
// 1 when its bottom reaches the viewport bottom (i.e. the sticky child has
// finished its travel). Read on a rAF so scroll never blocks on layout.
export function useScrollProgress(ref: RefObject<HTMLElement | null>): number {
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
			// rect.top goes from 0 (block top at viewport top) to -travel.
			const p = Math.min(1, Math.max(0, -rect.top / travel));
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
	}, [ref]);

	return progress;
}
