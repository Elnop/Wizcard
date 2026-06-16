'use client';

import { useCallback, useState } from 'react';
import { Button } from '@/components/Button/Button';
import styles from './ShareButton.module.css';

/**
 * Copies the current page URL (already the canonical /users/<id>/... share URL)
 * to the clipboard. Rendered only for the owner of the surface.
 */
export function ShareButton() {
	const [copied, setCopied] = useState(false);

	const handleShare = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(window.location.href);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// Clipboard may be unavailable (insecure context); silently no-op.
		}
	}, []);

	return (
		<Button variant="secondary" onClick={handleShare}>
			<span className={styles.label}>{copied ? 'Lien copié ✓' : 'Partager'}</span>
		</Button>
	);
}
