'use client';

import { useState } from 'react';
import type { Card, CardEntry } from '@/types/cards';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { MTG_LANGUAGES, LANGUAGE_TO_SCRYFALL_CODE } from '@/lib/mtg/languages';
import { PrintPickerModal } from './PrintPickerModal';
import { Modal } from '@/components/ui/Modal';
import styles from './CopyEditModal.module.css';

const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG'];

interface Props {
	card: Card;
	onSave: (patch: Partial<CardEntry>) => void;
	onChangePrint: (newCard: ScryfallCard) => void;
	onClose: () => void;
}

export function CopyEditModal({ card, onSave, onChangePrint, onClose }: Props) {
	const [showPrintPicker, setShowPrintPicker] = useState(false);
	const [tagInput, setTagInput] = useState('');
	const entry = card.entry;
	const isFoil = entry.isFoil ?? false;

	function save(patch: Partial<CardEntry>) {
		onSave({ ...entry, ...patch });
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

	const entryLangCode =
		entry.language && LANGUAGE_TO_SCRYFALL_CODE[entry.language]
			? LANGUAGE_TO_SCRYFALL_CODE[entry.language]
			: (card.lang ?? 'en');

	return (
		<>
			<Modal onClose={onClose} className={styles.modal} zIndex={1100}>
				<div className={styles.header}>
					<span className={styles.title}>
						Edit copy — {card.set.toUpperCase()} #{card.collector_number}
					</span>
					<button type="button" className={styles.closeIcon} onClick={onClose} aria-label="Close">
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

				<div className={styles.form}>
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

					{/* Language */}
					<div className={styles.field}>
						<label className={styles.label} htmlFor="copy-edit-language">
							Language
						</label>
						<select
							id="copy-edit-language"
							className={styles.select}
							value={entry.language ?? ''}
							onChange={(e) =>
								save({ language: (e.target.value as CardEntry['language']) || undefined })
							}
						>
							<option value="">— select —</option>
							{MTG_LANGUAGES.map((lang) => (
								<option key={lang} value={lang}>
									{lang}
								</option>
							))}
						</select>
					</div>

					{/* Tags */}
					<div className={styles.field}>
						<label className={styles.label} htmlFor="copy-edit-tags">
							Tags
						</label>
						<div className={styles.tagsField}>
							{(entry.tags ?? []).map((tag) => (
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
								placeholder={(entry.tags ?? []).length === 0 ? 'Add tags…' : ''}
							/>
						</div>
					</div>

					{/* Change print */}
					<button
						type="button"
						className={styles.changePrintBtn}
						onClick={() => setShowPrintPicker(true)}
					>
						Change print
					</button>
				</div>
			</Modal>

			{showPrintPicker && card.prints_search_uri && (
				<PrintPickerModal
					prints_search_uri={card.prints_search_uri}
					currentCardId={card.id}
					currentSet={card.set}
					currentCollectorNumber={card.collector_number}
					currentLang={entryLangCode}
					onSelect={(print) => {
						onChangePrint(print);
						setShowPrintPicker(false);
					}}
					onClose={() => setShowPrintPicker(false)}
				/>
			)}
		</>
	);
}
