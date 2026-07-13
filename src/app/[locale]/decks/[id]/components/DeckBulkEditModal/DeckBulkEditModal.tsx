'use client';
import { useTranslations } from 'next-intl';

import { useState } from 'react';
import { Modal } from '@/components/Modal/Modal';
import type { CardCondition, CardEntry } from '@/types/cards';
import type { DeckZone } from '@/types/decks';
import { MTG_LANGUAGES, type MtgLanguage } from '@/lib/mtg/languages';
import styles from './DeckBulkEditModal.module.css';

const CONDITIONS: CardCondition[] = ['NM', 'LP', 'MP', 'HP', 'DMG'];

const ZONE_LABELS: Record<DeckZone, string> = {
	mainboard: 'Mainboard',
	sideboard: 'Sideboard',
	maybeboard: 'Maybeboard',
	commander: 'Commander',
	tokens: 'Tokens',
};

// Tri-state select value: '' = leave untouched, 'true'/'false' = override
type TriState = '' | 'true' | 'false';

function triToBool(value: TriState): boolean | undefined {
	if (value === '') return undefined;
	return value === 'true';
}

export type DeckBulkEdit = {
	/** Field patch applied via updateDeckCard (zone excluded). */
	patch: Partial<CardEntry>;
	/** Target zone applied via changeZone, if chosen. */
	zone?: DeckZone;
};

type Props = {
	cardCount: number;
	/** Zones offered as move targets (commander only when the deck supports it). */
	zones: DeckZone[];
	onApply: (edit: DeckBulkEdit) => void;
	onClose: () => void;
};

/**
 * Bulk-edit modal for the deck selection. Every field is tri-state / optional:
 * an untouched field is left as-is on every selected copy. The chosen values
 * are applied to all copies of all selected cards.
 */
export function DeckBulkEditModal({ cardCount, zones, onApply, onClose }: Props) {
	const t = useTranslations('decks');
	const [zone, setZone] = useState<DeckZone | ''>('');
	const [condition, setCondition] = useState<CardCondition | ''>('');
	const [language, setLanguage] = useState<MtgLanguage | ''>('');
	const [foil, setFoil] = useState<TriState>('');
	const [foilType, setFoilType] = useState<'foil' | 'etched'>('foil');
	const [proxy, setProxy] = useState<TriState>('');
	const [forTrade, setForTrade] = useState<TriState>('');
	const [alter, setAlter] = useState<TriState>('');

	const [pendingTags, setPendingTags] = useState<string[]>([]);
	const [tagInput, setTagInput] = useState('');

	function addTag() {
		const newTag = tagInput.trim().replace(/,$/, '');
		if (newTag && !pendingTags.includes(newTag)) {
			setPendingTags((prev) => [...prev, newTag]);
		}
		setTagInput('');
	}

	function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
		if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
			e.preventDefault();
			addTag();
		} else if (e.key === 'Backspace' && !tagInput && pendingTags.length > 0) {
			setPendingTags((prev) => prev.slice(0, -1));
		}
	}

	function removeTag(tag: string) {
		setPendingTags((prev) => prev.filter((t) => t !== tag));
	}

	function buildPatch(): Partial<CardEntry> {
		const patch: Partial<CardEntry> = {};
		if (pendingTags.length > 0) patch.tags = pendingTags;
		const foilVal = triToBool(foil);
		if (foilVal !== undefined) {
			patch.isFoil = foilVal;
			patch.foilType = foilVal ? foilType : undefined;
		}
		const proxyVal = triToBool(proxy);
		if (proxyVal !== undefined) patch.proxy = proxyVal;
		const forTradeVal = triToBool(forTrade);
		if (forTradeVal !== undefined) patch.forTrade = forTradeVal;
		const alterVal = triToBool(alter);
		if (alterVal !== undefined) patch.alter = alterVal;
		if (condition) patch.condition = condition;
		if (language) patch.language = language;
		return patch;
	}

	const patch = buildPatch();
	const hasChanges = zone !== '' || Object.keys(patch).length > 0;
	const canApply = hasChanges && cardCount > 0;

	function handleApply() {
		if (!canApply) return;
		onApply({ patch, zone: zone || undefined });
		onClose();
	}

	return (
		<Modal onClose={onClose} className={styles.modal} zIndex={1100}>
			<div className={styles.header}>
				<span className={styles.title}>{t('editNCards', { count: cardCount })}</span>
				<button
					type="button"
					className={styles.closeIcon}
					onClick={onClose}
					aria-label={t('close')}
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
				<p className={styles.hint}>{t('leaveUnchangedHint')}</p>

				{/* Tags */}
				<div className={styles.field}>
					<label className={styles.label} htmlFor="bulk-edit-tags">
						{t('tagsAddedToCards')}
					</label>
					<div className={styles.tagsField}>
						{pendingTags.map((tag) => (
							<span key={tag} className={styles.tag}>
								{tag}
								<button
									type="button"
									className={styles.tagRemove}
									onClick={() => removeTag(tag)}
									aria-label={t('removeTag', { tag })}
								>
									×
								</button>
							</span>
						))}
						<input
							id="bulk-edit-tags"
							type="text"
							className={styles.tagInput}
							value={tagInput}
							onChange={(e) => setTagInput(e.target.value)}
							onKeyDown={handleTagKeyDown}
							onBlur={addTag}
							placeholder={pendingTags.length === 0 ? t('addTags') : ''}
						/>
					</div>
				</div>

				<div className={styles.grid}>
					{/* Zone */}
					<div className={styles.field}>
						<label className={styles.label} htmlFor="bulk-edit-zone">
							{t('zone')}
						</label>
						<select
							id="bulk-edit-zone"
							className={styles.select}
							value={zone}
							onChange={(e) => setZone(e.target.value as DeckZone | '')}
						>
							<option value="">{t('leaveUnchanged')}</option>
							{zones.map((z) => (
								<option key={z} value={z}>
									{ZONE_LABELS[z]}
								</option>
							))}
						</select>
					</div>

					{/* Condition */}
					<div className={styles.field}>
						<label className={styles.label} htmlFor="bulk-edit-condition">
							{t('condition')}
						</label>
						<select
							id="bulk-edit-condition"
							className={styles.select}
							value={condition}
							onChange={(e) => setCondition(e.target.value as CardCondition | '')}
						>
							<option value="">{t('leaveUnchanged')}</option>
							{CONDITIONS.map((c) => (
								<option key={c} value={c}>
									{c}
								</option>
							))}
						</select>
					</div>

					{/* Language */}
					<div className={styles.field}>
						<label className={styles.label} htmlFor="bulk-edit-language">
							{t('language')}
						</label>
						<select
							id="bulk-edit-language"
							className={styles.select}
							value={language}
							onChange={(e) => setLanguage(e.target.value as MtgLanguage | '')}
						>
							<option value="">{t('leaveUnchanged')}</option>
							{MTG_LANGUAGES.map((lang) => (
								<option key={lang} value={lang}>
									{lang}
								</option>
							))}
						</select>
					</div>

					{/* Foil */}
					<div className={styles.field}>
						<label className={styles.label} htmlFor="bulk-edit-foil">
							{t('foil')}
						</label>
						<select
							id="bulk-edit-foil"
							className={styles.select}
							value={foil}
							onChange={(e) => setFoil(e.target.value as TriState)}
						>
							<option value="">{t('leaveUnchanged')}</option>
							<option value="true">{t('yes')}</option>
							<option value="false">{t('no')}</option>
						</select>
					</div>

					{/* Foil type — only when foil = yes */}
					{foil === 'true' && (
						<div className={styles.field}>
							<label className={styles.label} htmlFor="bulk-edit-foiltype">
								{t('foilType')}
							</label>
							<select
								id="bulk-edit-foiltype"
								className={styles.select}
								value={foilType}
								onChange={(e) => setFoilType(e.target.value as 'foil' | 'etched')}
							>
								<option value="foil">foil</option>
								<option value="etched">etched</option>
							</select>
						</div>
					)}

					{/* Proxy */}
					<div className={styles.field}>
						<label className={styles.label} htmlFor="bulk-edit-proxy">
							{t('proxy')}
						</label>
						<select
							id="bulk-edit-proxy"
							className={styles.select}
							value={proxy}
							onChange={(e) => setProxy(e.target.value as TriState)}
						>
							<option value="">{t('leaveUnchanged')}</option>
							<option value="true">{t('yes')}</option>
							<option value="false">{t('no')}</option>
						</select>
					</div>

					{/* For trade */}
					<div className={styles.field}>
						<label className={styles.label} htmlFor="bulk-edit-fortrade">
							{t('forTrade')}
						</label>
						<select
							id="bulk-edit-fortrade"
							className={styles.select}
							value={forTrade}
							onChange={(e) => setForTrade(e.target.value as TriState)}
						>
							<option value="">{t('leaveUnchanged')}</option>
							<option value="true">{t('yes')}</option>
							<option value="false">{t('no')}</option>
						</select>
					</div>

					{/* Alter */}
					<div className={styles.field}>
						<label className={styles.label} htmlFor="bulk-edit-alter">
							{t('altered')}
						</label>
						<select
							id="bulk-edit-alter"
							className={styles.select}
							value={alter}
							onChange={(e) => setAlter(e.target.value as TriState)}
						>
							<option value="">{t('leaveUnchanged')}</option>
							<option value="true">{t('yes')}</option>
							<option value="false">{t('no')}</option>
						</select>
					</div>
				</div>
			</div>

			<div className={styles.footer}>
				<button type="button" className={styles.cancelBtn} onClick={onClose}>
					{t('cancel')}
				</button>
				<button
					type="button"
					className={styles.applyBtn}
					onClick={handleApply}
					disabled={!canApply}
				>
					{t('apply')}
				</button>
			</div>
		</Modal>
	);
}
