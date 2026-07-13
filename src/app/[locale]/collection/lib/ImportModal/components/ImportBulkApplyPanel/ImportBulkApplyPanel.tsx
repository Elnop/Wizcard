'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { CardCondition } from '@/types/cards';
import { MTG_LANGUAGES, type MtgLanguage } from '@/lib/mtg/languages';
import type { BulkApplyPatch } from '@/lib/import/hooks/useImportBulkApply';
import styles from './ImportBulkApplyPanel.module.css';

const CONDITIONS: CardCondition[] = ['NM', 'LP', 'MP', 'HP', 'DMG'];

// Tri-state select value: '' = leave untouched, 'true'/'false' = override
type TriState = '' | 'true' | 'false';

function triToBool(value: TriState): boolean | undefined {
	if (value === '') return undefined;
	return value === 'true';
}

interface Props {
	cardCount: number;
	onApplyToAll: (patch: BulkApplyPatch) => void;
}

export function ImportBulkApplyPanel({ cardCount, onApplyToAll }: Props) {
	const t = useTranslations('collection');
	const [isOpen, setIsOpen] = useState(false);

	const [pendingTags, setPendingTags] = useState<string[]>([]);
	const [tagInput, setTagInput] = useState('');
	const [proxy, setProxy] = useState<TriState>('');
	const [forTrade, setForTrade] = useState<TriState>('');
	const [foil, setFoil] = useState<TriState>('');
	const [foilType, setFoilType] = useState<'foil' | 'etched'>('foil');
	const [alter, setAlter] = useState<TriState>('');
	const [condition, setCondition] = useState<CardCondition | ''>('');
	const [language, setLanguage] = useState<MtgLanguage | ''>('');

	const [appliedCount, setAppliedCount] = useState<number | null>(null);

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

	function buildPatch(): BulkApplyPatch {
		const patch: BulkApplyPatch = {};
		if (pendingTags.length > 0) patch.tags = pendingTags;
		const proxyVal = triToBool(proxy);
		if (proxyVal !== undefined) patch.proxy = proxyVal;
		const forTradeVal = triToBool(forTrade);
		if (forTradeVal !== undefined) patch.forTrade = forTradeVal;
		const foilVal = triToBool(foil);
		if (foilVal !== undefined) {
			patch.isFoil = foilVal;
			patch.foilType = foilVal ? foilType : undefined;
		}
		const alterVal = triToBool(alter);
		if (alterVal !== undefined) patch.alter = alterVal;
		if (condition) patch.condition = condition;
		if (language) patch.language = language;
		return patch;
	}

	const patch = buildPatch();
	const hasChanges = Object.keys(patch).length > 0;
	const canApply = hasChanges && cardCount > 0;

	function handleApply() {
		if (!canApply) return;
		onApplyToAll(patch);
		setAppliedCount(cardCount);
	}

	return (
		<div className={styles.panel}>
			<button
				type="button"
				className={styles.header}
				onClick={() => setIsOpen((v) => !v)}
				aria-expanded={isOpen}
			>
				<span>{t('applyToAll')}</span>
				<span className={styles.chevron}>{isOpen ? '▾' : '▸'}</span>
			</button>

			{isOpen && (
				<div className={styles.body}>
					{/* Tags */}
					<div className={styles.field}>
						<label className={styles.label} htmlFor="bulk-tags">
							{t('tagsAdded')}
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
								id="bulk-tags"
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
						{/* Condition */}
						<div className={styles.field}>
							<label className={styles.label} htmlFor="bulk-condition">
								{t('conditionLabel')}
							</label>
							<select
								id="bulk-condition"
								className={styles.select}
								value={condition}
								onChange={(e) => setCondition(e.target.value as CardCondition | '')}
							>
								<option value="">{t('leaveUntouched')}</option>
								{CONDITIONS.map((c) => (
									<option key={c} value={c}>
										{c}
									</option>
								))}
							</select>
						</div>

						{/* Language */}
						<div className={styles.field}>
							<label className={styles.label} htmlFor="bulk-language">
								{t('language')}
							</label>
							<select
								id="bulk-language"
								className={styles.select}
								value={language}
								onChange={(e) => setLanguage(e.target.value as MtgLanguage | '')}
							>
								<option value="">{t('leaveUntouched')}</option>
								{MTG_LANGUAGES.map((lang) => (
									<option key={lang} value={lang}>
										{lang}
									</option>
								))}
							</select>
						</div>

						{/* Proxy */}
						<div className={styles.field}>
							<label className={styles.label} htmlFor="bulk-proxy">
								{t('proxy')}
							</label>
							<select
								id="bulk-proxy"
								className={styles.select}
								value={proxy}
								onChange={(e) => setProxy(e.target.value as TriState)}
							>
								<option value="">{t('leaveUntouched')}</option>
								<option value="true">{t('yes')}</option>
								<option value="false">{t('no')}</option>
							</select>
						</div>

						{/* For trade */}
						<div className={styles.field}>
							<label className={styles.label} htmlFor="bulk-fortrade">
								{t('forTrade')}
							</label>
							<select
								id="bulk-fortrade"
								className={styles.select}
								value={forTrade}
								onChange={(e) => setForTrade(e.target.value as TriState)}
							>
								<option value="">{t('leaveUntouched')}</option>
								<option value="true">{t('yes')}</option>
								<option value="false">{t('no')}</option>
							</select>
						</div>

						{/* Alter */}
						<div className={styles.field}>
							<label className={styles.label} htmlFor="bulk-alter">
								{t('altered')}
							</label>
							<select
								id="bulk-alter"
								className={styles.select}
								value={alter}
								onChange={(e) => setAlter(e.target.value as TriState)}
							>
								<option value="">{t('leaveUntouched')}</option>
								<option value="true">{t('yes')}</option>
								<option value="false">{t('no')}</option>
							</select>
						</div>

						{/* Foil */}
						<div className={styles.field}>
							<label className={styles.label} htmlFor="bulk-foil">
								{t('foil')}
							</label>
							<select
								id="bulk-foil"
								className={styles.select}
								value={foil}
								onChange={(e) => setFoil(e.target.value as TriState)}
							>
								<option value="">{t('leaveUntouched')}</option>
								<option value="true">{t('yes')}</option>
								<option value="false">{t('no')}</option>
							</select>
						</div>

						{/* Foil type — only when foil = yes */}
						{foil === 'true' && (
							<div className={styles.field}>
								<label className={styles.label} htmlFor="bulk-foiltype">
									{t('foilType')}
								</label>
								<select
									id="bulk-foiltype"
									className={styles.select}
									value={foilType}
									onChange={(e) => setFoilType(e.target.value as 'foil' | 'etched')}
								>
									<option value="foil">foil</option>
									<option value="etched">etched</option>
								</select>
							</div>
						)}
					</div>

					<div className={styles.applyRow}>
						<button
							type="button"
							className={styles.applyBtn}
							onClick={handleApply}
							disabled={!canApply}
						>
							{t('apply')}
						</button>
						{appliedCount !== null && (
							<span className={styles.appliedLabel}>{t('appliedTo', { count: appliedCount })}</span>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
