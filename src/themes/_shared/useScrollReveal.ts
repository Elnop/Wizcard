'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Triggers a CSS class when the element enters the viewport.
 * Returns a ref callback and a boolean.
 */
export function useScrollReveal(
	options?: IntersectionObserverInit
): [(node: Element | null) => void, boolean] {
	const [visible, setVisible] = useState(false);
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
					setVisible(true);
					observerRef.current?.disconnect();
				}
			}, options);

			observerRef.current.observe(node);
		},
		[options]
	);

	return [ref, visible];
}

/**
 * Returns a scroll progress value (0-1) based on how far the element
 * has scrolled through the viewport.
 */
export function useScrollProgress(): [(node: Element | null) => void, number] {
	const [progress, setProgress] = useState(0);
	const nodeRef = useRef<Element | null>(null);
	const rafRef = useRef<number>(0);

	const ref = useCallback((node: Element | null) => {
		nodeRef.current = node;
	}, []);

	useEffect(() => {
		function onScroll() {
			if (rafRef.current) cancelAnimationFrame(rafRef.current);
			rafRef.current = requestAnimationFrame(() => {
				if (!nodeRef.current) return;
				const rect = nodeRef.current.getBoundingClientRect();
				const vh = window.innerHeight;
				// 0 when element top enters bottom of viewport, 1 when element bottom leaves top
				const p = Math.max(0, Math.min(1, (vh - rect.top) / (vh + rect.height)));
				setProgress(p);
			});
		}

		window.addEventListener('scroll', onScroll, { passive: true });
		onScroll();
		return () => {
			window.removeEventListener('scroll', onScroll);
			if (rafRef.current) cancelAnimationFrame(rafRef.current);
		};
	}, []);

	return [ref, progress];
}
