'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAnalytics } from '../context/AnalyticsContext';

// Captures a $pageview on every App Router navigation. usePathname/useSearchParams
// require a Suspense boundary at the mount site (see Providers wiring).
export function AnalyticsPageView() {
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const analytics = useAnalytics();

	useEffect(() => {
		if (!pathname) return;
		const query = searchParams?.toString();
		const url = query ? `${pathname}?${query}` : pathname;
		analytics.page(window.location.origin + url);
	}, [pathname, searchParams, analytics]);

	return null;
}
