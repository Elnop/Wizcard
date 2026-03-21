'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

type Message = { title: string; description: string };

export function HashErrorHandler({
	messages,
	defaultMessage,
}: {
	messages: Record<string, Message>;
	defaultMessage: Message;
}) {
	const router = useRouter();

	useEffect(() => {
		const hash = window.location.hash.slice(1);
		if (!hash) return;

		const params = new URLSearchParams(hash);
		const errorCode = params.get('error_code') ?? params.get('error');
		if (!errorCode) return;

		// Redirige proprement vers /auth/error avec le code en query param
		const known = errorCode in messages || errorCode in messages;
		void known; // used for type narrowing only
		router.replace(`/auth/error?error_code=${encodeURIComponent(errorCode)}`);
	}, [messages, defaultMessage, router]);

	return null;
}
