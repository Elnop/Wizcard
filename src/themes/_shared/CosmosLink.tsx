'use client';

import { useSyncExternalStore } from 'react';

function getHostname() {
	return typeof window !== 'undefined' ? window.location.hostname : '';
}

function subscribe() {
	return () => {};
}

export function CosmosLink({ theme }: { theme: string }) {
	const hostname = useSyncExternalStore(subscribe, getHostname, () => '');

	if (!hostname) return null;

	const href = `http://${hostname}:5000`;

	return (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			style={{
				position: 'fixed',
				bottom: 16,
				right: 16,
				zIndex: 9999,
				padding: '8px 16px',
				fontSize: 13,
				fontWeight: 600,
				color: '#fff',
				background: 'rgba(0, 0, 0, 0.7)',
				backdropFilter: 'blur(8px)',
				border: '1px solid rgba(255, 255, 255, 0.15)',
				borderRadius: 8,
				textDecoration: 'none',
				display: 'flex',
				alignItems: 'center',
				gap: 6,
			}}
		>
			<svg
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
			>
				<circle cx="12" cy="12" r="10" />
				<circle cx="12" cy="12" r="3" />
			</svg>
			Cosmos — {theme}
		</a>
	);
}
