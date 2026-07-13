'use client';

import { useEffect } from 'react';
import { useRouter } from '@/i18n/navigation';

/**
 * Certaines erreurs Supabase arrivent dans le fragment d'URL
 * (`#error_code=otp_expired`), invisible côté serveur. Ce composant les relit
 * côté client et les repromeut en query param pour que la page serveur affiche
 * le bon message localisé.
 */
export function HashErrorHandler() {
	const router = useRouter();

	useEffect(() => {
		const hash = window.location.hash.slice(1);
		if (!hash) return;

		const params = new URLSearchParams(hash);
		const errorCode = params.get('error_code') ?? params.get('error');
		if (!errorCode) return;

		router.replace(`/auth/error?error_code=${encodeURIComponent(errorCode)}`);
	}, [router]);

	return null;
}
