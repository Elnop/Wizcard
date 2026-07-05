'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

/**
 * The bare profile URL has no tab of its own — it redirects to the Decks tab so
 * every rendered profile view has an explicit, shareable tab URL. The shell
 * (header + tabs, loading / not-found) lives in the layout, which wraps this
 * redirect too.
 */
export default function ProfileIndexRedirect() {
	const router = useRouter();
	const params = useParams();
	const nickname = params.userId as string;

	useEffect(() => {
		router.replace(`/users/${nickname}/decks`);
	}, [router, nickname]);

	return null;
}
