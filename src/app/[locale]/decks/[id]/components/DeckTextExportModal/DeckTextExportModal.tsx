'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
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
	const t = useTranslations('decks');
	const [copied, setCopied] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleCopy() {
		try {
			await navigator.clipboard.writeText(text);
			setError(null);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			setError(t('copyFailed'));
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
			<h2 className={styles.title}>{t('exportDecklist')}</h2>

			<textarea className={styles.textarea} value={text} readOnly aria-label={t('decklist')} />

			{error && <p className={styles.error}>{error}</p>}

			<div className={styles.actions}>
				<Button variant="secondary" size="sm" onClick={onClose}>
					{t('close')}
				</Button>
				<Button variant="secondary" size="sm" onClick={handleDownload}>
					{t('downloadTxt')}
				</Button>
				<Button variant="primary" size="sm" onClick={handleCopy}>
					{copied ? t('copied') : t('copy')}
				</Button>
			</div>
		</Modal>
	);
}
