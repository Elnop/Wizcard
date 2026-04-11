'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/Modal/Modal';
import { Button } from '@/components/Button/Button';
import type { DeckFormat } from '@/types/decks';
import type { DeckZone } from '@/types/decks';
import { useDeckContext } from '@/lib/deck/context/DeckContext';
import { parseMTGADeck, type DeckImportResult } from '@/lib/import/formats/mtga-deck';
import { getCardCollection } from '@/lib/scryfall/endpoints/cards';
import { deduplicateIdentifiers } from '@/lib/import/utils/identifier-dedup';
import { useSetCodeNormalizer } from '@/lib/import/hooks/useSetCodeNormalizer';
import { extractMoxfieldId, fetchMoxfieldDeck } from '@/lib/moxfield/fetch-deck';
import { convertMoxfieldDeck, type MoxfieldImportData } from '@/lib/moxfield/convert-deck';
import type { ScryfallCard, ScryfallCardIdentifier } from '@/lib/scryfall/types/scryfall';
import styles from './ImportDeckModal.module.css';

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

const FORMAT_LABELS: Record<string, string> = Object.fromEntries(
	FORMATS.filter((f) => f.value).map((f) => [f.value, f.label])
);

const BATCH_SIZE = 75;

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

async function resolveCards(identifiers: ScryfallCardIdentifier[]) {
	const deduped = deduplicateIdentifiers(identifiers);

	const results: ScryfallCard[] = [];

	for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
		const batch = deduped.slice(i, i + BATCH_SIZE);
		const response = await getCardCollection(batch);
		results.push(...response.data);
	}

	return results;
}

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
	const { createDeck, bulkAddCardsToDeck } = useDeckContext();
	const router = useRouter();
	const normalizeSetCodes = useSetCodeNormalizer();

	const [mode, setMode] = useState<ImportMode>('paste');

	// Paste mode state
	const [name, setName] = useState('');
	const [format, setFormat] = useState<DeckFormat | ''>('');
	const [text, setText] = useState('');
	const [errors, setErrors] = useState<string[]>([]);
	const [isImporting, setIsImporting] = useState(false);

	const nameManuallyEdited = useRef(false);
	const formatManuallyEdited = useRef(false);

	// URL mode state
	const [url, setUrl] = useState('');
	const [isFetching, setIsFetching] = useState(false);
	const [moxfieldData, setMoxfieldData] = useState<MoxfieldImportData | null>(null);

	const parsed = useMemo(() => (text.trim() ? parseMTGADeck(text) : null), [text]);
	const detectionHint = useMemo(() => (parsed ? buildDetectionHint(parsed) : null), [parsed]);

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
			setErrors(['Invalid Moxfield URL. Expected: https://moxfield.com/decks/...']);
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
			setErrors([err instanceof Error ? err.message : 'Failed to fetch deck from Moxfield.']);
		} finally {
			setIsFetching(false);
		}
	}, [url]);

	// --- Import handlers ---

	const handleImportPaste = useCallback(async () => {
		setErrors([]);

		if (!parsed || parsed.rows.length === 0) {
			setErrors(
				parsed && parsed.parseErrors.length > 0
					? parsed.parseErrors
					: [
							'No valid cards found. Paste a deck list with lines like "4 Lightning Bolt" or "4x Lightning Bolt (M11) 149"',
						]
			);
			return;
		}

		setIsImporting(true);

		try {
			const normalized = normalizeSetCodes(parsed);
			const resolved = await resolveCards(normalized.identifiers);

			const cardMap = new Map<string, ScryfallCard>();
			for (const card of resolved) {
				cardMap.set(`${card.set}:${card.collector_number}`, card);
				cardMap.set(`name:${card.name.toLowerCase()}`, card);
				const slashIdx = card.name.indexOf(' // ');
				if (slashIdx !== -1) {
					cardMap.set(`name:${card.name.slice(0, slashIdx).toLowerCase()}`, card);
				}
			}

			const deckId = createDeck(name.trim() || 'Imported Deck', format || null, null);

			const cardsToAdd: Array<{
				card: ScryfallCard;
				zone: (typeof normalized.rows)[0]['zone'];
				quantity: number;
			}> = [];
			const notFound: string[] = [];

			for (const row of normalized.rows) {
				let card =
					row.set && row.collectorNumber
						? cardMap.get(`${row.set}:${row.collectorNumber}`)
						: undefined;
				if (!card && row.set) {
					card = resolved.find(
						(c) =>
							c.set === row.set &&
							(c.name.toLowerCase() === row.name.toLowerCase() ||
								c.name.toLowerCase().startsWith(row.name.toLowerCase() + ' // '))
					);
				}
				if (!card) {
					card = cardMap.get(`name:${row.name.toLowerCase()}`);
				}

				if (card) {
					cardsToAdd.push({ card, zone: row.zone, quantity: row.quantity });
				} else {
					notFound.push(`${row.quantity} ${row.name}`);
				}
			}

			if (cardsToAdd.length === 0) {
				setErrors([`No cards could be resolved. Check card names and try again.`]);
				setIsImporting(false);
				return;
			}

			bulkAddCardsToDeck(deckId, cardsToAdd);

			router.push(`/decks/${deckId}`);
		} catch (err) {
			setErrors([`Import failed: ${err instanceof Error ? err.message : 'unknown error'}`]);
			setIsImporting(false);
		}
	}, [parsed, name, format, createDeck, bulkAddCardsToDeck, router, normalizeSetCodes]);

	const handleImportMoxfield = useCallback(() => {
		if (!moxfieldData || moxfieldData.cards.length === 0) return;

		setIsImporting(true);

		try {
			const deckId = createDeck(
				name.trim() || moxfieldData.name,
				format || null,
				moxfieldData.description
			);

			// bulkAddCardsToDeck expects ScryfallCard objects but only uses card.id
			const cardsToAdd = moxfieldData.cards.map((c) => ({
				card: { id: c.scryfallId } as ScryfallCard,
				zone: c.zone,
				quantity: c.quantity,
			}));

			bulkAddCardsToDeck(deckId, cardsToAdd);

			router.push(`/decks/${deckId}`);
		} catch (err) {
			setErrors([`Import failed: ${err instanceof Error ? err.message : 'unknown error'}`]);
			setIsImporting(false);
		}
	}, [moxfieldData, name, format, createDeck, bulkAddCardsToDeck, router]);

	const handleImport = mode === 'paste' ? handleImportPaste : handleImportMoxfield;

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

	return (
		<Modal className={styles.dialog}>
			<div className={styles.form}>
				<h2 className={styles.title}>Import a Deck</h2>

				<div className={styles.tabs}>
					<button
						type="button"
						className={`${styles.tab} ${mode === 'paste' ? styles.tabActive : ''}`}
						onClick={() => handleModeChange('paste')}
					>
						Paste list
					</button>
					<button
						type="button"
						className={`${styles.tab} ${mode === 'url' ? styles.tabActive : ''}`}
						onClick={() => handleModeChange('url')}
					>
						Moxfield URL
					</button>
				</div>

				{mode === 'paste' && (
					<>
						<label className={styles.label}>
							Deck List
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
							Moxfield Deck URL
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
									Fetch
								</Button>
							</div>
						</label>

						{moxfieldData && <p className={styles.hint}>{buildMoxfieldSummary(moxfieldData)}</p>}
					</>
				)}

				<label className={styles.label}>
					Name
					<input
						type="text"
						className={styles.input}
						value={name}
						onChange={handleNameChange}
						placeholder="My Imported Deck"
					/>
				</label>

				<label className={styles.label}>
					Format
					<select className={styles.input} value={format} onChange={handleFormatChange}>
						{FORMATS.map((f) => (
							<option key={f.value} value={f.value} className={styles.option}>
								{f.label}
							</option>
						))}
					</select>
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
					<Button variant="ghost" type="button" onClick={onClose} disabled={isImporting}>
						Cancel
					</Button>
					<Button onClick={handleImport} disabled={!canImport} isLoading={isImporting}>
						Import
					</Button>
				</div>
			</div>
		</Modal>
	);
}
