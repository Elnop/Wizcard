'use client';

import { useState } from 'react';
import { Modal } from '@/components/Modal/Modal';
import { Button } from '@/components/Button/Button';
import styles from './DeckTextExportModal.module.css';

type Props = {
	text: string;
	deckName: string;
	onClose: () => void;
};

function sanitizeFileName(name: string): string {
	const cleaned = name.replace(/[^\p{L}\p{N}\- _]/gu, '').trim();
	return cleaned || 'deck';
}

export function DeckTextExportModal({ text, deckName, onClose }: Props) {
	const [copied, setCopied] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleCopy() {
		try {
			await navigator.clipboard.writeText(text);
			setError(null);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			setError('Copy failed — select the text and copy it manually.');
		}
	}

	function handleDownload() {
		if (!text) return;
		const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${sanitizeFileName(deckName)}.txt`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	return (
		<Modal onClose={onClose} className={styles.dialog} zIndex={1100}>
			<h2 className={styles.title}>Export decklist</h2>

			<textarea className={styles.textarea} value={text} readOnly aria-label="Decklist" />

			{error && <p className={styles.error}>{error}</p>}

			<div className={styles.actions}>
				<Button variant="secondary" size="sm" onClick={onClose}>
					Close
				</Button>
				<Button variant="secondary" size="sm" onClick={handleDownload}>
					Download .txt
				</Button>
				<Button variant="primary" size="sm" onClick={handleCopy}>
					{copied ? 'Copied ✓' : 'Copy'}
				</Button>
			</div>
		</Modal>
	);
}
