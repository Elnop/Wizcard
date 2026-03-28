'use client';

import { useCallback, useRef, useState } from 'react';

export function useInView(
	options?: IntersectionObserverInit
): [(node: Element | null) => void, boolean] {
	const [inView, setInView] = useState(false);
	const observerRef = useRef<IntersectionObserver | null>(null);

	const ref = useCallback(
		(node: Element | null) => {
			if (observerRef.current) {
				observerRef.current.disconnect();
				observerRef.current = null;
			}

			if (!node) return;

			observerRef.current = new IntersectionObserver(([entry]) => {
				if (entry.isIntersecting) {
					setInView(true);
					observerRef.current?.disconnect();
				}
			}, options);

			observerRef.current.observe(node);
		},
		[options]
	);

	return [ref, inView];
}
