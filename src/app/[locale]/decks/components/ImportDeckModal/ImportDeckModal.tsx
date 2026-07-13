'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Modal } from '@/components/Modal/Modal';
import { Button } from '@/components/Button/Button';
import { Spinner } from '@/components/Spinner/Spinner';
import type { DeckFormat } from '@/types/decks';
import type { DeckZone } from '@/types/decks';
import { useDeckContext } from '@/lib/deck/context/DeckContext';
import { parseMTGADeck, type DeckImportResult } from '@/lib/import/formats/mtga-deck';
import { useSetCodeNormalizer } from '@/lib/import/hooks/useSetCodeNormalizer';
import {
	resolveDeckList,
	resolveCardsByScryfallId,
	type ResolvedDeckRow,
} from '@/lib/import/hooks/useResolveDeckList';
import {
	ImportPreview,
	type ImportPreviewCopy,
} from '@/lib/import/components/ImportPreview/ImportPreview';
import { extractMoxfieldId, fetchMoxfieldDeck } from '@/lib/moxfield/fetch-deck';
import { convertMoxfieldDeck, type MoxfieldImportData } from '@/lib/moxfield/convert-deck';
import styles from './ImportDeckModal.module.css';

// New decks have no existing cards. A stable module-level reference avoids
// retriggering useImportPreviewEdit's regeneration effect on every render.
const EMPTY_ORACLE_IDS = new Set<string>();

type Step = 'input' | 'resolving' | 'preview';

const FORMATS: { value: DeckFormat | ''; label: string }[] = [
	{ value: '', label: 'No format' },
	{ value: 'standard', label: 'Standard' },
	{ value: 'modern', label: 'Modern' },
	{ value: 'pioneer', label: 'Pioneer' },
	{ value: 'legacy', label: 'Legacy' },
	{ value: 'vintage', label: 'Vintage' },
	{ value: 'commander', label: 'Commander' },
	{ value: 'pauper', label: 'Pauper' },
	{ value: 'brawl', label: 'Brawl' },
	{ value: 'oathbreaker', label: 'Oathbreaker' },
	{ value: 'draft', label: 'Draft' },
	{ value: 'limited', label: 'Limited' },
];

export const FORMAT_LABELS: Record<string, string> = Object.fromEntries(
	FORMATS.filter((f) => f.value).map((f) => [f.value, f.label])
);

const PLACEHOLDER = `4 Lightning Bolt (M11) 149
4x Counterspell
2 Snapcaster Mage (ISD)

Sideboard
2 Rest in Peace
1 Flusterstorm`;

type ImportMode = 'paste' | 'url';

type Props = {
	onClose: () => void;
};

function buildDetectionHint(parsed: DeckImportResult): string | null {
	if (parsed.rows.length === 0) return null;

	let mainboard = 0;
	let sideboard = 0;
	let commander = 0;
	for (const row of parsed.rows) {
		switch (row.zone) {
			case 'mainboard':
				mainboard += row.quantity;
				break;
			case 'sideboard':
				sideboard += row.quantity;
				break;
			case 'commander':
				commander += row.quantity;
				break;
		}
	}

	const parts: string[] = [];
	if (parsed.detectedFormat) {
		parts.push(FORMAT_LABELS[parsed.detectedFormat] ?? parsed.detectedFormat);
	}

	const cardParts: string[] = [];
	if (commander > 0) cardParts.push(`${commander} commander`);
	if (mainboard > 0) cardParts.push(`${mainboard} mainboard`);
	if (sideboard > 0) cardParts.push(`${sideboard} sideboard`);
	parts.push(cardParts.join(' + '));

	return parts.join(' — ');
}

function buildMoxfieldSummary(data: MoxfieldImportData): string {
	const counts: Record<DeckZone, number> = {
		mainboard: 0,
		sideboard: 0,
		commander: 0,
		maybeboard: 0,
		tokens: 0,
	};
	for (const card of data.cards) {
		counts[card.zone] += card.quantity;
	}

	const parts: string[] = [];
	if (data.format) parts.push(FORMAT_LABELS[data.format] ?? data.format);

	const cardParts: string[] = [];
	if (counts.commander > 0) cardParts.push(`${counts.commander} commander`);
	if (counts.mainboard > 0) cardParts.push(`${counts.mainboard} mainboard`);
	if (counts.sideboard > 0) cardParts.push(`${counts.sideboard} sideboard`);
	if (counts.maybeboard > 0) cardParts.push(`${counts.maybeboard} maybeboard`);
	parts.push(cardParts.join(' + '));

	return parts.join(' — ');
}

export function ImportDeckModal({ onClose }: Props) {
	const t = useTranslations('decks');
	const importFailedMessage = useCallback(
		(err: unknown): string =>
			t('importFailed', { message: err instanceof Error ? err.message : t('unknownError') }),
		[t]
	);
	const { createDeck, bulkAddCardsToDeck } = useDeckContext();
	const router = useRouter();
	const { normalize: normalizeSetCodes } = useSetCodeNormalizer();

	const [mode, setMode] = useState<ImportMode>('paste');
	const [step, setStep] = useState<Step>('input');

	// Paste mode state
	const [name, setName] = useState('');
	const [format, setFormat] = useState<DeckFormat | ''>('');
	const [text, setText] = useState('');
	const [errors, setErrors] = useState<string[]>([]);
	const [isImporting, setIsImporting] = useState(false);

	// Resolved cards for the preview step (paste mode only).
	const [resolvedRows, setResolvedRows] = useState<ResolvedDeckRow[]>([]);
	const [notFound, setNotFound] = useState<string[]>([]);

	const nameManuallyEdited = useRef(false);
	const formatManuallyEdited = useRef(false);

	// URL mode state
	const [url, setUrl] = useState('');
	const [isFetching, setIsFetching] = useState(false);
	const [moxfieldData, setMoxfieldData] = useState<MoxfieldImportData | null>(null);

	const parsed = useMemo(() => (text.trim() ? parseMTGADeck(text) : null), [text]);
	const detectionHint = useMemo(() => (parsed ? buildDetectionHint(parsed) : null), [parsed]);

	// The resolved rows already carry per-card zones (pasted sections or Moxfield
	// boards). Treat the list as sectioned when any row lands outside mainboard, so
	// those zones are honored in the preview instead of being flattened.
	const hasSections = useMemo(
		() => resolvedRows.some((r) => r.zone !== 'mainboard'),
		[resolvedRows]
	);

	const handleTextChange = useCallback(
		(value: string) => {
			setText(value);

			const result = value.trim() ? parseMTGADeck(value) : null;
			if (!result) return;

			if (result.deckName && !nameManuallyEdited.current) {
				setName(result.deckName);
			}
			if (result.detectedFormat && !formatManuallyEdited.current) {
				setFormat(result.detectedFormat);
			}
		},
		[setName, setFormat]
	);

	const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		nameManuallyEdited.current = true;
		setName(e.target.value);
	}, []);

	const handleFormatChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
		formatManuallyEdited.current = true;
		setFormat(e.target.value as DeckFormat | '');
	}, []);

	// --- URL mode handlers ---

	const handleFetchMoxfield = useCallback(async () => {
		setErrors([]);
		setMoxfieldData(null);

		const publicId = extractMoxfieldId(url);
		if (!publicId) {
			setErrors([t('invalidMoxfieldUrl')]);
			return;
		}

		setIsFetching(true);
		try {
			const response = await fetchMoxfieldDeck(publicId);
			const data = convertMoxfieldDeck(response);
			setMoxfieldData(data);

			if (!nameManuallyEdited.current) setName(data.name);
			if (!formatManuallyEdited.current) setFormat(data.format ?? '');
		} catch (err) {
			setErrors([err instanceof Error ? err.message : t('moxfieldFetchFailed')]);
		} finally {
			setIsFetching(false);
		}
	}, [url, t]);

	// --- Import handlers ---

	// Paste mode resolves to a preview step (with bulk edit) before deck creation.
	const handleResolvePaste = useCallback(async () => {
		setErrors([]);

		if (!parsed || parsed.rows.length === 0) {
			setErrors(parsed && parsed.parseErrors.length > 0 ? parsed.parseErrors : [t('noValidCards')]);
			return;
		}

		setStep('resolving');
		try {
			const { cardsToAdd, notFound } = await resolveDeckList(parsed, normalizeSetCodes);
			if (cardsToAdd.length === 0) {
				setErrors([t('noCardsResolved')]);
				setStep('input');
				return;
			}
			setResolvedRows(cardsToAdd);
			setNotFound(notFound);
			setStep('preview');
		} catch (err) {
			setErrors([importFailedMessage(err)]);
			setStep('input');
		}
	}, [parsed, normalizeSetCodes, t, importFailedMessage]);

	const handleCreateFromPreview = useCallback(
		(copies: ImportPreviewCopy[]) => {
			setIsImporting(true);
			try {
				const description = mode === 'url' ? (moxfieldData?.description ?? null) : null;
				const deckId = createDeck(
					name.trim() || t('importedDeckDefault'),
					format || null,
					description
				);
				bulkAddCardsToDeck(deckId, copies);
				router.push(`/decks/${deckId}`);
			} catch (err) {
				setErrors([importFailedMessage(err)]);
				setIsImporting(false);
			}
		},
		[
			mode,
			moxfieldData,
			name,
			format,
			createDeck,
			bulkAddCardsToDeck,
			router,
			t,
			importFailedMessage,
		]
	);

	// URL mode resolves the Moxfield scryfall ids into concrete cards, then steps
	// through the same preview (bulk edit) as paste mode.
	const handleResolveMoxfield = useCallback(async () => {
		if (!moxfieldData || moxfieldData.cards.length === 0) return;
		setErrors([]);
		setStep('resolving');
		try {
			const { cardsToAdd, notFound } = await resolveCardsByScryfallId(moxfieldData.cards);
			if (cardsToAdd.length === 0) {
				setErrors([t('noMoxfieldCards')]);
				setStep('input');
				return;
			}
			setResolvedRows(cardsToAdd);
			setNotFound(notFound);
			setStep('preview');
		} catch (err) {
			setErrors([importFailedMessage(err)]);
			setStep('input');
		}
	}, [moxfieldData, t, importFailedMessage]);

	// Both paste and URL modes now step through a preview.
	const handlePrimary = mode === 'paste' ? handleResolvePaste : handleResolveMoxfield;
	const primaryLabel = t('preview');

	const canImport =
		mode === 'paste'
			? text.trim().length > 0 && !isImporting
			: moxfieldData !== null && moxfieldData.cards.length > 0 && !isImporting;

	const handleModeChange = useCallback((newMode: ImportMode) => {
		setMode(newMode);
		setErrors([]);
		if (!nameManuallyEdited.current) setName('');
		if (!formatManuallyEdited.current) setFormat('');
	}, []);

	const nameFormatFields = (
		<>
			<label className={styles.label}>
				{t('nameLabel')}
				<input
					type="text"
					className={styles.input}
					value={name}
					onChange={handleNameChange}
					placeholder={t('importedDeckPlaceholder')}
				/>
			</label>

			<label className={styles.label}>
				{t('format')}
				<select className={styles.input} value={format} onChange={handleFormatChange}>
					{FORMATS.map((f) => (
						<option key={f.value} value={f.value} className={styles.option}>
							{f.value ? f.label : t('noFormatOption')}
						</option>
					))}
				</select>
			</label>
		</>
	);

	function renderInput() {
		return (
			<div className={styles.form}>
				<h2 className={styles.title}>{t('importDeckTitle2')}</h2>

				<div className={styles.tabs}>
					<button
						type="button"
						className={`${styles.tab} ${mode === 'paste' ? styles.tabActive : ''}`}
						onClick={() => handleModeChange('paste')}
					>
						{t('pasteList')}
					</button>
					<button
						type="button"
						className={`${styles.tab} ${mode === 'url' ? styles.tabActive : ''}`}
						onClick={() => handleModeChange('url')}
					>
						{t('moxfieldUrl')}
					</button>
				</div>

				{mode === 'paste' && (
					<>
						<label className={styles.label}>
							{t('deckListLabel')}
							<textarea
								className={styles.textarea}
								placeholder={PLACEHOLDER}
								value={text}
								onChange={(e) => handleTextChange(e.target.value)}
								rows={10}
								autoFocus
							/>
						</label>

						{detectionHint && <p className={styles.hint}>{detectionHint}</p>}
					</>
				)}

				{mode === 'url' && (
					<>
						<label className={styles.label}>
							{t('moxfieldUrlLabel')}
							<div className={styles.urlRow}>
								<input
									type="url"
									className={styles.input}
									value={url}
									onChange={(e) => setUrl(e.target.value)}
									placeholder="https://moxfield.com/decks/..."
									autoFocus
								/>
								<Button
									variant="secondary"
									onClick={handleFetchMoxfield}
									disabled={!url.trim() || isFetching}
									isLoading={isFetching}
								>
									{t('fetch')}
								</Button>
							</div>
						</label>

						{moxfieldData && <p className={styles.hint}>{buildMoxfieldSummary(moxfieldData)}</p>}
					</>
				)}

				{nameFormatFields}

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
					<Button variant="ghost" type="button" onClick={onClose} disabled={isImporting}>
						{t('cancel')}
					</Button>
					<Button onClick={handlePrimary} disabled={!canImport} isLoading={isImporting}>
						{primaryLabel}
					</Button>
				</div>
			</div>
		);
	}

	return (
		<Modal className={`${styles.dialog} ${step === 'preview' ? styles.dialogWide : ''}`}>
			{step === 'input' && renderInput()}

			{step === 'resolving' && (
				<div className={styles.form}>
					<div className={styles.loadingScreen}>
						<Spinner size="md" />
						<p className={styles.loadingLabel}>{t('resolvingCards')}</p>
					</div>
				</div>
			)}

			{step === 'preview' && (
				<div className={styles.previewWrap}>
					<h2 className={styles.title}>{t('importDeckTitle2')}</h2>
					<ImportPreview
						resolvedRows={resolvedRows}
						existingOracleIds={EMPTY_ORACLE_IDS}
						notFound={notFound}
						hasSections={hasSections}
						primaryLabel={(n) => t('createDeckWithCards', { count: n })}
						onImport={handleCreateFromPreview}
						onBack={() => setStep('input')}
						isSubmitting={isImporting}
						headerExtra={nameFormatFields}
					/>
				</div>
			)}
		</Modal>
	);
}
