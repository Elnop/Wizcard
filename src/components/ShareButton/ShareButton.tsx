'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/Button/Button';
import styles from './ShareButton.module.css';

/**
 * Copies the canonical shareable URL (origin + the given /users/<id>/... path) to
 * the clipboard. The path is passed explicitly so the copied link is correct even
 * when the button is rendered on a non-canonical route (e.g. /collection).
 * Rendered only for the owner of the surface.
 */
export function ShareButton({ path }: { path: string }) {
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (!copied) return;
		const timer = setTimeout(() => setCopied(false), 2000);
		return () => clearTimeout(timer);
	}, [copied]);

	const handleShare = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(window.location.origin + path);
			setCopied(true);
		} catch {
			// Clipboard may be unavailable (insecure context); silently no-op.
		}
	}, [path]);

	return (
		<Button variant="secondary" onClick={handleShare}>
			<span className={styles.label}>{copied ? 'Link copied ✓' : 'Share'}</span>
		</Button>
	);
}
