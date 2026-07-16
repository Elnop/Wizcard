'use client';

import { useEffect } from 'react';
import NextError from 'next/error';
import { getAnalytics } from '@/lib/analytics/context/AnalyticsContext';

export default function GlobalError({
	error,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		getAnalytics().captureException(error, { scope: 'global', digest: error.digest });
	}, [error]);

	return (
		<html>
			<body>
				<NextError statusCode={0} />
			</body>
		</html>
	);
}
