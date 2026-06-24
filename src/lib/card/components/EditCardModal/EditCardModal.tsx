'use client';

import { useEffect, useRef, useState } from 'react';
import type { Card, CardEntry } from '@/types/cards';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { type DeckZone, setDeckZone } from '@/types/decks';
import { MTG_LANGUAGES, SCRYFALL_CODE_TO_LANGUAGE } from '@/lib/mtg/languages';
import { CardImage } from '@/lib/card/components/CardImage/CardImage';
import { CardPrintPickerModal } from '@/lib/card/components/CardPrintPickerModal/CardPrintPickerModal';
import { Modal } from '@/components/Modal/Modal';
import { getCardBySetNumberAndLang } from '@/lib/scryfall/endpoints/cards';
import { resolveLanguageChange } from './resolveLanguageChange';
import styles from './EditCardModal.module.css';

const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG'];

interface EditProps {
	mode?: 'edit';
	card: Card;
	onSave: (patch: Partial<CardEntry>) => void;
	onChangePrint: (newCard: ScryfallCard) => void;
	onClose: () => void;
}

interface AddProps {
	mode: 'add';
	scryfallCard: ScryfallCard;
	onAdd: (card: ScryfallCard, entry: Partial<CardEntry>, count: number) => void;
	onClose: () => void;
	availableZones?: DeckZone[];
	defaultZone?: DeckZone;
	hideQuantity?: boolean;
}

type Props = EditProps | AddProps;

function isAddMode(props: Props): props is AddProps {
	return props.mode === 'add';
}

const ZONE_LABELS: Record<DeckZone, string> = {
	mainboard: 'Mainboard',
	sideboard: 'Sideboard',
	maybeboard: 'Maybeboard',
	commander: 'Commander',
	tokens: 'Tokens',
};

export function EditCardModal(props: Props) {
	const addMode = isAddMode(props);
	const initialZone: DeckZone = addMode ? (props.defaultZone ?? 'mainboard') : 'mainboard';

	const [draftEntry, setDraftEntry] = useState<Partial<CardEntry>>(
		addMode ? { tags: setDeckZone(undefined, initialZone) } : { ...props.card.entry }
	);
	const [selectedPrint, setSelectedPrint] = useState<ScryfallCard>(
		addMode ? props.scryfallCard : (props.card as ScryfallCard)
	);

	const entry: Partial<CardEntry> = draftEntry;
	const [showPrintPicker, setShowPrintPicker] = useState(false);
	const [tagInput, setTagInput] = useState('');
	const [quantity, setQuantity] = useState(1);
	const isFoil = entry.isFoil ?? false;
	const [langInfoMessage, setLangInfoMessage] = useState<string | null>(null);
	const langFetchAbort = useRef<AbortController | null>(null);

	function save(patch: Partial<CardEntry>) {
		setDraftEntry((prev) => ({ ...prev, ...patch }));
	}

	async function handleLanguageChange(value: string) {
		const language = (value as CardEntry['language']) || undefined;
		save({ language });

		const action = resolveLanguageChange(language, selectedPrint);
		if (action.kind === 'skip') {
			setLangInfoMessage(null);
			langFetchAbort.current?.abort();
			return;
		}

		langFetchAbort.current?.abort();
		const controller = new AbortController();
		langFetchAbort.current = controller;

		try {
			const localized = await getCardBySetNumberAndLang(
				action.set,
				action.collectorNumber,
				action.langCode,
				controller.signal
			);
			if (controller.signal.aborted) return;
			// Update the local preview only. The print and language are committed to
			// the collection on Save (handleSave), like every other field — committing
			// mid-edit churns the global store and destabilizes the open modal.
			setSelectedPrint(localized);
			setLangInfoMessage(null);
		} catch (err: unknown) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			if (controller.signal.aborted) return;
			setLangInfoMessage('Image localisée indisponible pour cette édition.');
		}
	}

	useEffect(() => {
		return () => langFetchAbort.current?.abort();
	}, []);

	function handleSave() {
		if (!addMode) {
			// Commit a print change (incl. localized language) before the metadata
			// patch. Both target the same rowId, so order is consistent.
			if (selectedPrint.id !== props.card.id) {
				props.onChangePrint(selectedPrint);
			}
			props.onSave(draftEntry);
			props.onClose();
		}
	}

	function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
		const currentTags = entry.tags ?? [];
		if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
			e.preventDefault();
			const newTag = tagInput.trim().replace(/,$/, '');
			if (newTag && !currentTags.includes(newTag)) {
				const newTags = [...currentTags, newTag];
				save({ tags: newTags.length > 0 ? newTags : undefined });
			}
			setTagInput('');
		} else if (e.key === 'Backspace' && !tagInput && currentTags.length > 0) {
			const newTags = currentTags.slice(0, -1);
			save({ tags: newTags.length > 0 ? newTags : undefined });
		}
	}

	function removeTag(tag: string) {
		const newTags = (entry.tags ?? []).filter((t) => t !== tag);
		save({ tags: newTags.length > 0 ? newTags : undefined });
	}

	function handleConfirmAdd() {
		if (addMode) {
			props.onAdd(selectedPrint, draftEntry, quantity);
			props.onClose();
		}
	}

	const cardForPrint: ScryfallCard = selectedPrint;

	// Highlight the print actually shown in the preview. Using the displayed
	// print's lang keeps the picker's "current" marker correct even when a
	// chosen language has no localized print (404 → preview stays unchanged).
	const entryLangCode = cardForPrint.lang ?? 'en';

	const title = addMode
		? `Ajouter — ${selectedPrint.set_name} #${selectedPrint.collector_number}`
		: `Edit copy — ${props.card.set?.toUpperCase() ?? ''} #${props.card.collector_number ?? ''}`;

	return (
		<>
			<Modal onClose={props.onClose} className={styles.modal} zIndex={1100}>
				<div className={styles.header}>
					<span className={styles.title}>{title}</span>
					<button
						type="button"
						className={styles.closeIcon}
						onClick={props.onClose}
						aria-label="Close"
					>
						<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
							<path
								d="M2 2l12 12M14 2L2 14"
								stroke="currentColor"
								strokeWidth="1.8"
								strokeLinecap="round"
							/>
						</svg>
					</button>
				</div>

				<div className={styles.body}>
					<div className={styles.preview}>
						<CardImage card={selectedPrint} size="normal" />
					</div>
					<div className={styles.form}>
						{/* Quantité (add mode only, unless hideQuantity) */}
						{addMode && !props.hideQuantity && (
							<div className={styles.field}>
								<label className={styles.label} htmlFor="copy-add-quantity">
									Quantité
								</label>
								<input
									id="copy-add-quantity"
									type="number"
									min={1}
									step={1}
									className={styles.select}
									value={quantity}
									onChange={(e) => {
										const n = parseInt(e.target.value, 10);
										setQuantity(Number.isNaN(n) ? 1 : Math.max(1, n));
									}}
								/>
							</div>
						)}

						{/* Zone (add mode only, when multiple zones available) */}
						{addMode && props.availableZones && props.availableZones.length > 1 && (
							<div className={styles.field}>
								<label className={styles.label} htmlFor="copy-edit-zone">
									Zone
								</label>
								<select
									id="copy-edit-zone"
									className={styles.select}
									value={
										(entry.tags ?? []).find((t) => t.startsWith('deck:'))?.replace('deck:', '') ??
										initialZone
									}
									onChange={(e) =>
										save({ tags: setDeckZone(entry.tags, e.target.value as DeckZone) })
									}
								>
									{props.availableZones.map((z) => (
										<option key={z} value={z}>
											{ZONE_LABELS[z]}
										</option>
									))}
								</select>
							</div>
						)}

						{/* Condition */}
						<div className={styles.field}>
							<label className={styles.label} htmlFor="copy-edit-condition">
								Condition
							</label>
							<select
								id="copy-edit-condition"
								className={styles.select}
								value={entry.condition ?? ''}
								onChange={(e) =>
									save({ condition: (e.target.value as CardEntry['condition']) || undefined })
								}
							>
								<option value="">— select —</option>
								{CONDITIONS.map((c) => (
									<option key={c} value={c}>
										{c}
									</option>
								))}
							</select>
						</div>

						{/* Foil */}
						<div className={styles.field}>
							<label className={styles.label}>Foil</label>
							<div className={styles.foilRow}>
								<button
									type="button"
									className={`${styles.foilToggle} ${isFoil ? styles.foilToggleActive : ''}`}
									onClick={() =>
										save({
											isFoil: !isFoil,
											foilType: !isFoil ? (entry.foilType ?? 'foil') : undefined,
										})
									}
								>
									✦ Foil
								</button>
								{isFoil && (
									<select
										className={styles.select}
										value={entry.foilType ?? 'foil'}
										onChange={(e) => save({ foilType: e.target.value as 'foil' | 'etched' })}
									>
										<option value="foil">Foil</option>
										<option value="etched">Etched</option>
									</select>
								)}
							</div>
						</div>

						{/* Proxy */}
						<div className={styles.field}>
							<label className={styles.label}>Proxy</label>
							<div className={styles.foilRow}>
								<button
									type="button"
									className={`${styles.foilToggle} ${entry.proxy ? styles.proxyToggleActive : ''}`}
									onClick={() => save({ proxy: !entry.proxy })}
								>
									▣ Proxy
								</button>
							</div>
						</div>

						{/* Language */}
						<div className={styles.field}>
							<label className={styles.label} htmlFor="copy-edit-language">
								Language
							</label>
							<select
								id="copy-edit-language"
								className={styles.select}
								value={entry.language ?? ''}
								onChange={(e) => handleLanguageChange(e.target.value)}
							>
								<option value="">— select —</option>
								{MTG_LANGUAGES.map((lang) => (
									<option key={lang} value={lang}>
										{lang}
									</option>
								))}
							</select>
							{langInfoMessage && <p className={styles.langInfo}>{langInfoMessage}</p>}
						</div>

						{/* Tags */}
						<div className={styles.field}>
							<label className={styles.label} htmlFor="copy-edit-tags">
								Tags
							</label>
							<div className={styles.tagsField}>
								{(entry.tags ?? [])
									.filter((tag) => !tag.includes(':'))
									.map((tag) => (
										<span key={tag} className={styles.tag}>
											{tag}
											<button
												type="button"
												className={styles.tagRemove}
												onClick={() => removeTag(tag)}
												aria-label={`Remove tag ${tag}`}
											>
												×
											</button>
										</span>
									))}
								<input
									id="copy-edit-tags"
									type="text"
									className={styles.tagInput}
									value={tagInput}
									onChange={(e) => setTagInput(e.target.value)}
									onKeyDown={handleTagKeyDown}
									placeholder={
										(entry.tags ?? []).filter((tag) => !tag.includes(':')).length === 0
											? 'Add tags…'
											: ''
									}
								/>
							</div>
						</div>

						{/* Change print (both modes) */}
						<button
							type="button"
							className={styles.changePrintBtn}
							onClick={() => setShowPrintPicker(true)}
						>
							Change print
						</button>

						{/* Confirm add (add mode only) */}
						{addMode && (
							<button type="button" className={styles.changePrintBtn} onClick={handleConfirmAdd}>
								Confirmer l&apos;ajout
							</button>
						)}
						{!addMode && (
							<button type="button" className={styles.saveBtn} onClick={handleSave}>
								Sauvegarder
							</button>
						)}
					</div>
				</div>
			</Modal>

			{showPrintPicker && cardForPrint && cardForPrint.prints_search_uri && (
				<CardPrintPickerModal
					prints_search_uri={cardForPrint.prints_search_uri}
					currentCardId={cardForPrint.id}
					currentSet={cardForPrint.set}
					currentCollectorNumber={cardForPrint.collector_number}
					currentLang={entryLangCode}
					onSelect={(print) => {
						// Local preview + draft only; committed to the collection on Save.
						setSelectedPrint(print);
						const lang = print.lang ? SCRYFALL_CODE_TO_LANGUAGE[print.lang] : undefined;
						save({ language: lang });
						setLangInfoMessage(null);
						setShowPrintPicker(false);
					}}
					onClose={() => setShowPrintPicker(false)}
				/>
			)}
		</>
	);
}
