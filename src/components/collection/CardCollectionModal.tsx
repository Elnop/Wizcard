'use client';

import { useState } from 'react';
import type { Card, StackMeta } from '@/types/card';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { CardImage } from '@/components/cards/CardImage';
import { MTG_LANGUAGES } from '@/lib/mtg/languages';
import { useScryfallSymbols } from '@/lib/scryfall/hooks/useScryfallSymbols';
import { SymbolText } from '@/components/ui/SymbolText';
import { PrintPickerModal } from './PrintPickerModal';
import styles from './CardCollectionModal.module.css';
import lightboxStyles from './lightbox.module.css';

const COLOR_MAP: Record<string, string> = {
	W: '#f8e7b9',
	U: '#0e68ab',
	B: '#a0a0a0',
	R: '#d3202a',
	G: '#00733e',
	C: '#ccc2c0',
};

const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG'];

interface Props {
	card: Card | null;
	onClose: () => void;
	onSave: (cardId: string, updates: Partial<StackMeta>) => void;
	onRemove: (cardId: string) => void;
	onChangePrint?: (oldCardId: string, newCard: ScryfallCard) => void;
	onIncrement?: () => void;
	onDecrement?: () => void;
}

interface InnerProps {
	card: Card;
	onClose: () => void;
	onSave: (cardId: string, updates: Partial<StackMeta>) => void;
	onRemove: (cardId: string) => void;
	onChangePrint?: (oldCardId: string, newCard: ScryfallCard) => void;
	onIncrement?: () => void;
	onDecrement?: () => void;
}

function CardCollectionModalInner({
	card,
	onClose,
	onSave,
	onRemove,
	onChangePrint,
	onIncrement,
	onDecrement,
}: InnerProps) {
	const [tagInput, setTagInput] = useState('');
	const [showPrintPicker, setShowPrintPicker] = useState(false);
	const [lightbox, setLightbox] = useState(false);
	const symbolMap = useScryfallSymbols();

	function save(patch: Partial<StackMeta>) {
		const currentTags = card.tags ?? [];
		onSave(card.scryfallId, {
			condition: card.condition || undefined,
			isFoil: card.isFoil ?? false,
			foilType: (card.isFoil ?? false) ? (card.foilType ?? 'foil') : undefined,
			language: card.language || undefined,
			tags: currentTags.length > 0 ? currentTags : undefined,
			...patch,
		});
	}

	function handleRemove() {
		onRemove(card.scryfallId);
	}

	function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
		const currentTags = card.tags ?? [];
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
		const newTags = (card.tags ?? []).filter((t) => t !== tag);
		save({ tags: newTags.length > 0 ? newTags : undefined });
	}

	const isFoil = card.isFoil ?? false;

	return (
		<>
			<div
				className={styles.overlay}
				onClick={(e) => {
					e.stopPropagation();
					onClose();
				}}
			>
				<div className={styles.modal} onClick={(e) => e.stopPropagation()}>
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

					<div className={styles.layout}>
						<div className={styles.imageCol}>
							<CardImage card={card} size="large" priority onClick={() => setLightbox(true)} />
							<button
								type="button"
								className={styles.changePrintBtn}
								onClick={() => setShowPrintPicker(true)}
							>
								Change print
							</button>
						</div>

						<div className={styles.infoCol}>
							<div className={styles.cardMeta}>
								<div className={styles.cardNameRow}>
									<h2 className={styles.cardName}>{card.name}</h2>
									{card.mana_cost && (
										<span className={styles.headerMana}>
											<SymbolText text={card.mana_cost} symbolMap={symbolMap} />
										</span>
									)}
								</div>
								{card.color_identity && card.color_identity.length > 0 && (
									<div className={styles.colorPips}>
										{card.color_identity.map((c) => (
											<span
												key={c}
												className={styles.colorPip}
												style={{ background: COLOR_MAP[c] ?? '#888' }}
												title={c}
											/>
										))}
									</div>
								)}
							</div>

							<div className={styles.form}>
								{/* Quantity */}
								<div className={styles.field}>
									<label className={styles.label}>Quantity</label>
									<div className={styles.quantityRow}>
										<button
											type="button"
											className={styles.qtyBtn}
											onClick={() => onDecrement?.()}
											aria-label="Decrease quantity"
											disabled={card.count <= 1}
										>
											−
										</button>
										<span className={styles.qtyValue}>{card.count ?? 1}</span>
										<button
											type="button"
											className={styles.qtyBtn}
											onClick={() => onIncrement?.()}
											aria-label="Increase quantity"
										>
											+
										</button>
									</div>
								</div>

								{/* Condition */}
								<div className={styles.field}>
									<label className={styles.label} htmlFor="condition">
										Condition
									</label>
									<select
										id="condition"
										className={styles.select}
										value={card.condition ?? ''}
										onChange={(e) => save({ condition: e.target.value || undefined })}
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
													foilType: !isFoil ? (card.foilType ?? 'foil') : undefined,
												})
											}
										>
											✦ Foil
										</button>
										{isFoil && (
											<select
												className={styles.select}
												value={card.foilType ?? 'foil'}
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
									<label className={styles.label} htmlFor="language">
										Language
									</label>
									<select
										id="language"
										className={styles.select}
										value={card.language ?? ''}
										onChange={(e) => save({ language: e.target.value || undefined })}
									>
										<option value="">— select —</option>
										{MTG_LANGUAGES.map((lang) => (
											<option key={lang} value={lang}>
												{lang}
											</option>
										))}
									</select>
								</div>

								{/* Tags — full width */}
								<div className={`${styles.field} ${styles.fieldFull}`}>
									<label className={styles.label} htmlFor="tags">
										Tags
									</label>
									<div className={styles.tagsField}>
										{(card.tags ?? []).map((tag) => (
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
											id="tags"
											type="text"
											className={styles.tagInput}
											value={tagInput}
											onChange={(e) => setTagInput(e.target.value)}
											onKeyDown={handleTagKeyDown}
											placeholder={(card.tags ?? []).length === 0 ? 'Add tags…' : ''}
										/>
									</div>
								</div>
							</div>

							<hr className={styles.divider} />

							<div className={styles.details}>
								{card.type_line && (
									<div className={styles.detailRow}>
										<span className={styles.detailLabel}>Type</span>
										<span className={styles.detailValue}>{card.type_line}</span>
									</div>
								)}
								<div className={styles.detailRow}>
									<span className={styles.detailLabel}>Set</span>
									<span className={styles.detailValue}>
										{card.set_name}
										{card.rarity && (
											<span className={`${styles.rarity} ${styles[card.rarity]}`}>
												{' '}
												· {card.rarity}
											</span>
										)}
									</span>
								</div>
								{card.oracle_text && (
									<div>
										<span className={styles.detailLabel}>Oracle</span>
										<div className={styles.oracleText}>
											{card.oracle_text.split('\n').map((line, i) => (
												<p key={i} className={styles.oracleLine}>
													<SymbolText text={line} symbolMap={symbolMap} />
												</p>
											))}
										</div>
									</div>
								)}
								{card.flavor_text && <p className={styles.flavorText}>{card.flavor_text}</p>}
								{card.loyalty && (
									<div className={styles.detailRow}>
										<span className={styles.detailLabel}>Loyalty</span>
										<span className={styles.detailValue}>{card.loyalty}</span>
									</div>
								)}
								{card.keywords && card.keywords.length > 0 && (
									<div className={styles.keywords}>
										{card.keywords.map((k) => (
											<span key={k} className={styles.keyword}>
												{k}
											</span>
										))}
									</div>
								)}
								<div className={styles.detailRow}>
									<span className={styles.detailLabel}>Artist</span>
									<span className={styles.detailValue}>{card.artist ?? '—'}</span>
								</div>
								<div className={styles.detailRow}>
									<span className={styles.detailLabel}>Print</span>
									<span className={styles.detailValue}>
										{card.set.toUpperCase()} #{card.collector_number}
									</span>
								</div>
							</div>

							<div className={styles.actions}>
								<button type="button" className={styles.removeBtn} onClick={handleRemove}>
									Remove
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>

			{lightbox && (
				<div className={lightboxStyles.lightbox} onClick={() => setLightbox(false)}>
					<div className={lightboxStyles.lightboxCard} onClick={(e) => e.stopPropagation()}>
						<CardImage card={card} size="large" priority />
					</div>
				</div>
			)}

			{showPrintPicker && card.prints_search_uri && (
				<PrintPickerModal
					prints_search_uri={card.prints_search_uri}
					currentCardId={card.id}
					onSelect={(print) => {
						setShowPrintPicker(false);
						onChangePrint?.(card.scryfallId, print);
					}}
					onClose={() => setShowPrintPicker(false)}
				/>
			)}
		</>
	);
}

export function CardCollectionModal({
	card,
	onClose,
	onSave,
	onRemove,
	onChangePrint,
	onIncrement,
	onDecrement,
}: Props) {
	if (!card) return null;
	return (
		<CardCollectionModalInner
			key={card.scryfallId}
			card={card}
			onClose={onClose}
			onSave={onSave}
			onRemove={onRemove}
			onChangePrint={onChangePrint}
			onIncrement={onIncrement}
			onDecrement={onDecrement}
		/>
	);
}
