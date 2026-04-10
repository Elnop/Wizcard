'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/Modal/Modal';
import { Button } from '@/components/Button/Button';
import type { DeckFormat } from '@/types/decks';
import { useDeckContext } from '@/lib/deck/context/DeckContext';
import { parseMTGADeck, type DeckImportResult } from '@/lib/import/formats/mtga-deck';
import { getCardCollection } from '@/lib/scryfall/endpoints/cards';
import { deduplicateIdentifiers } from '@/lib/import/utils/identifier-dedup';
import { useSetCodeNormalizer } from '@/lib/import/hooks/useSetCodeNormalizer';
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

export function ImportDeckModal({ onClose }: Props) {
	const { createDeck, bulkAddCardsToDeck } = useDeckContext();
	const router = useRouter();
	const normalizeSetCodes = useSetCodeNormalizer();

	const [name, setName] = useState('');
	const [format, setFormat] = useState<DeckFormat | ''>('');
	const [text, setText] = useState('');
	const [errors, setErrors] = useState<string[]>([]);
	const [isImporting, setIsImporting] = useState(false);

	const nameManuallyEdited = useRef(false);
	const formatManuallyEdited = useRef(false);

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

	const handleImport = useCallback(async () => {
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
			// Normalize MTGA/MTGO set codes to Scryfall codes before resolving
			const normalized = normalizeSetCodes(parsed);
			const resolved = await resolveCards(normalized.identifiers);

			// Build a lookup: identifier key → ScryfallCard
			// Index by set+collector_number, full name, and front-face name (for DFCs)
			const cardMap = new Map<string, ScryfallCard>();
			for (const card of resolved) {
				cardMap.set(`${card.set}:${card.collector_number}`, card);
				cardMap.set(`name:${card.name.toLowerCase()}`, card);
				// DFC: Scryfall returns "Front // Back", MTGA lists only "Front"
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

	const canImport = text.trim().length > 0 && !isImporting;

	return (
		<Modal className={styles.dialog}>
			<div className={styles.form}>
				<h2 className={styles.title}>Import a Deck</h2>

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
