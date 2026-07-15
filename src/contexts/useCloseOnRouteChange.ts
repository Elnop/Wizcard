'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from '@/i18n/navigation';

/**
 * Closes a globally-mounted modal when the route changes. Modal providers live
 * at the app root and hold their own open-state, so navigating from a link or
 * button inside the modal (e.g. a card's "more info" link) changes the URL
 * without unmounting the provider — the modal would otherwise stay open over
 * the new page. Runs `close` on every pathname change after mount, never on the
 * initial render.
 */
export function useCloseOnRouteChange(close: () => void): void {
	const pathname = usePathname();
	const previous = useRef(pathname);

	useEffect(() => {
		if (previous.current !== pathname) {
			previous.current = pathname;
			close();
		}
	}, [pathname, close]);
}
