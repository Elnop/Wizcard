'use client';

import { useEffect, useState } from 'react';

// SSR renders false so the server markup matches the pre-hydration client;
// the effect then upgrades to the real value after mount.
export function useReducedMotion(): boolean {
	const [reduced, setReduced] = useState(false);

	useEffect(() => {
		const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setReduced(mq.matches);
		const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
		mq.addEventListener('change', onChange);
		return () => mq.removeEventListener('change', onChange);
	}, []);

	return reduced;
}
