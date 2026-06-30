'use client';

import { useState, useCallback, useMemo } from 'react';
import { Modal } from '@/components/Modal/Modal';
import { Button } from '@/components/Button/Button';
import { Spinner } from '@/components/Spinner/Spinner';
import { ImportPreview } from '@/lib/import/components/ImportPreview/ImportPreview';
import { useDeckContext } from '@/lib/deck/context/DeckContext';
import { parseMTGADeck } from '@/lib/import/formats/mtga-deck';
import { useSetCodeNormalizer } from '@/lib/import/hooks/useSetCodeNormalizer';
import { resolveDeckList, type ResolvedDeckRow } from '@/lib/import/hooks/useResolveDeckList';
import styles from './ImportListIntoDeckModal.module.css';

const PLACEHOLDER = `4 Lightning Bolt (M11) 149
4x Counterspell
2 Snapcaster Mage (ISD)

Sideboard
2 Rest in Peace
1 Flusterstorm`;

type Step = 'input' | 'resolving' | 'preview';

function modalTitle(step: Step): string {
	switch (step) {
		case 'resolving':
			return 'Fetching cards…';
		case 'preview':
			return 'Import preview';
		default:
			return 'Import a list';
	}
}

type Props = {
	deckId: string;
	existingOracleIds: Set<string>;
	onClose: () => void;
};

export function ImportListIntoDeckModal({ deckId, existingOracleIds, onClose }: Props) {
	const { bulkAddCardsToDeck } = useDeckContext();
	const { normalize: normalizeSetCodes } = useSetCodeNormalizer();

	const [step, setStep] = useState<Step>('input');

	const [text, setText] = useState('');
	const [resolvedRows, setResolvedRows] = useState<ResolvedDeckRow[]>([]);
	const [notFound, setNotFound] = useState<string[]>([]);
	const [errors, setErrors] = useState<string[]>([]);

	const parsed = useMemo(() => (text.trim() ? parseMTGADeck(text) : null), [text]);

	// A list has explicit zone sections if any parsed row lands outside mainboard.
	const hasSections = useMemo(
		() => (parsed ? parsed.rows.some((r) => r.zone !== 'mainboard') : false),
		[parsed]
	);

	const handleResolve = useCallback(async () => {
		setErrors([]);

		if (!parsed || parsed.rows.length === 0) {
			setErrors(
				parsed && parsed.parseErrors.length > 0
					? parsed.parseErrors
					: ['No valid card. Paste a list like “4 Lightning Bolt”.']
			);
			return;
		}

		setStep('resolving');
		try {
			const result = await resolveDeckList(parsed, normalizeSetCodes);
			setResolvedRows(result.cardsToAdd);
			setNotFound(result.notFound);
			setStep('preview');
		} catch (err) {
			setErrors([`Preview failed: ${err instanceof Error ? err.message : 'unknown error'}`]);
			setStep('input');
		}
	}, [parsed, normalizeSetCodes]);

	const backToInput = useCallback(() => {
		setStep('input');
	}, []);

	const handleImport = useCallback(
		(copies: Parameters<typeof bulkAddCardsToDeck>[1]) => {
			bulkAddCardsToDeck(deckId, copies);
			onClose();
		},
		[bulkAddCardsToDeck, deckId, onClose]
	);

	function renderInput() {
		return (
			<div className={styles.form}>
				<label className={styles.label}>
					Card list
					<textarea
						className={styles.textarea}
						placeholder={PLACEHOLDER}
						value={text}
						onChange={(e) => setText(e.target.value)}
						rows={9}
						autoFocus
					/>
				</label>

				{errors.length > 0 && (
					<div className={styles.errors}>
						{errors.map((err, i) => (
							<p key={i} className={styles.errorLine}>
								{err}
							</p>
						))}
					</div>
				)}

				<div className={styles.actions}>
					<Button variant="ghost" type="button" onClick={onClose}>
						Cancel
					</Button>
					<Button onClick={handleResolve} disabled={!text.trim()}>
						Preview
					</Button>
				</div>
			</div>
		);
	}

	function renderResolving() {
		return (
			<div className={styles.loadingScreen}>
				<Spinner size="md" />
				<p className={styles.loadingLabel}>Fetching cards…</p>
			</div>
		);
	}

	return (
		<Modal className={`${styles.modal} ${step === 'preview' ? styles.modalWide : ''}`}>
			<button className={styles.closeIcon} onClick={onClose} aria-label="Close" type="button">
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<path
						d="M2 2l12 12M14 2L2 14"
						stroke="currentColor"
						strokeWidth="1.8"
						strokeLinecap="round"
					/>
				</svg>
			</button>
			<h2 className={styles.title}>{modalTitle(step)}</h2>
			{step === 'input' && renderInput()}
			{step === 'resolving' && renderResolving()}
			{step === 'preview' && (
				<ImportPreview
					resolvedRows={resolvedRows}
					existingOracleIds={existingOracleIds}
					notFound={notFound}
					hasSections={hasSections}
					primaryLabel={(n) => `Add ${n} card${n === 1 ? '' : 's'}`}
					onImport={handleImport}
					onBack={backToInput}
				/>
			)}
		</Modal>
	);
}
