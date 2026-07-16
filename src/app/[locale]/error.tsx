'use client';

import { AppErrorBoundary } from '@/lib/analytics/components/AppErrorBoundary/AppErrorBoundary';

// eslint-disable-next-line sonarjs/no-globals-shadowing
export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
	return <AppErrorBoundary {...props} scope="app" />;
}
