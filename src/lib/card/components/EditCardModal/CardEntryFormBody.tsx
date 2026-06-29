'use client';

import type { ReactNode } from 'react';
import type { CardEntry } from '@/types/cards';
import { MTG_LANGUAGES } from '@/lib/mtg/languages';
import { CardImage } from '@/lib/card/components/CardImage/CardImage';
import { CardPrintPickerModal } from '@/lib/card/components/CardPrintPickerModal/CardPrintPickerModal';
import { Modal } from '@/components/Modal/Modal';
import type { useCardEntryForm } from './useCardEntryForm';
import styles from './EditCardModal.module.css';

const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG'];

type Props = {
	title: string;
	form: ReturnType<typeof useCardEntryForm>;
	onClose: () => void;
	/** Mode-specific fields rendered above Condition (e.g. Quantity, Zone). */
	topExtras?: ReactNode;
	/** Mode-specific action button(s) rendered after Change print (Confirm / Save). */
	actions: ReactNode;
};

/**
 * Shared presentational body for the card-entry modals. Renders the preview and
 * the common fields (Condition / Foil / Proxy / Language / Tags) plus the
 * Change-print flow. Quantity/Zone and the confirm/save button are injected by
 * the specific modal via `topExtras` / `actions`.
 */
export function CardEntryFormBody({ title, form, onClose, topExtras, actions }: Props) {
	const { draftEntry: entry, selectedPrint } = form;
	const isFoil = entry.isFoil ?? false;

	return (
		<>
			<Modal onClose={onClose} className={styles.modal} zIndex={1100}>
				<div className={styles.header}>
					<span className={styles.title}>{title}</span>
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

				<div className={styles.body}>
					<div className={styles.preview}>
						<CardImage card={selectedPrint} size="normal" />
					</div>
					<div className={styles.form}>
						{topExtras}

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
									form.save({ condition: (e.target.value as CardEntry['condition']) || undefined })
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
										form.save({
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
										onChange={(e) => form.save({ foilType: e.target.value as 'foil' | 'etched' })}
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
									onClick={() => form.save({ proxy: !entry.proxy })}
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
								onChange={(e) => form.handleLanguageChange(e.target.value)}
							>
								<option value="">— select —</option>
								{MTG_LANGUAGES.map((lang) => (
									<option key={lang} value={lang}>
										{lang}
									</option>
								))}
							</select>
							{form.langInfoMessage && <p className={styles.langInfo}>{form.langInfoMessage}</p>}
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
												onClick={() => form.removeTag(tag)}
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
									value={form.tagInput}
									onChange={(e) => form.setTagInput(e.target.value)}
									onKeyDown={form.handleTagKeyDown}
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
							onClick={() => form.setShowPrintPicker(true)}
						>
							Change print
						</button>

						{actions}
					</div>
				</div>
			</Modal>

			{form.showPrintPicker && selectedPrint.prints_search_uri && (
				<CardPrintPickerModal
					prints_search_uri={selectedPrint.prints_search_uri}
					currentCardId={selectedPrint.id}
					currentSet={selectedPrint.set}
					currentCollectorNumber={selectedPrint.collector_number}
					currentLang={form.entryLangCode}
					onSelect={form.selectPrint}
					onClose={() => form.setShowPrintPicker(false)}
				/>
			)}
		</>
	);
}
