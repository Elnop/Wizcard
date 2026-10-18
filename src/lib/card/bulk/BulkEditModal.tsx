'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/Modal/Modal';
import type { CardCondition } from '@/types/cards';
import { MTG_LANGUAGES, type MtgLanguage } from '@/lib/mtg/languages';
import {
	EMPTY_BULK_EDIT_FORM,
	buildBulkEdit,
	isEmptyBulkEdit,
	type BulkEdit,
	type BulkEditForm,
	type BulkField,
	type TriState,
} from './bulk-edit';
import { TagListInput } from './TagListInput';
import styles from './BulkEditModal.module.css';

const CONDITIONS: CardCondition[] = ['NM', 'LP', 'MP', 'HP', 'DMG'];

type Props = {
	title: string;
	/** Fields offered, in display order of the grid (tags are always on top). */
	fields: readonly BulkField[];
	/** Extra controls rendered first in the grid (the deck's zone picker). */
	extraFields?: ReactNode;
	/** Whether the extra controls hold a change (enables "Apply" on their own). */
	extraHasChanges?: boolean;
	onApply: (edit: BulkEdit) => void;
	onClose: () => void;
};

/**
 * Bulk-edit modal shared by deck, collection and wishlist. Every field is
 * tri-state / optional: an untouched field is left as-is on every copy.
 */
export function BulkEditModal({
	title,
	fields,
	extraFields,
	extraHasChanges = false,
	onApply,
	onClose,
}: Props) {
	const t = useTranslations('bulk');
	const [form, setForm] = useState<BulkEditForm>(EMPTY_BULK_EDIT_FORM);
	const has = (f: BulkField) => fields.includes(f);
	const update = <K extends keyof BulkEditForm>(key: K, value: BulkEditForm[K]) =>
		setForm((prev) => ({ ...prev, [key]: value }));

	const edit = buildBulkEdit(form);
	const canApply = extraHasChanges || !isEmptyBulkEdit(edit);

	function handleApply() {
		if (!canApply) return;
		onApply(edit);
		onClose();
	}

	const triSelect = (id: string, label: string, key: 'foil' | 'proxy' | 'forTrade' | 'alter') => (
		<div className={styles.field}>
			<label className={styles.label} htmlFor={id}>
				{label}
			</label>
			<select
				id={id}
				className={styles.select}
				value={form[key]}
				onChange={(e) => update(key, e.target.value as TriState)}
			>
				<option value="">{t('leaveUnchanged')}</option>
				<option value="true">{t('yes')}</option>
				<option value="false">{t('no')}</option>
			</select>
		</div>
	);

	return (
		<Modal onClose={onClose} className={styles.modal} zIndex={1100}>
			<div className={styles.header}>
				<span className={styles.title}>{title}</span>
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

				{has('tagsAdd') && (
					<TagListInput
						id="bulk-edit-tags-add"
						label={t('tagsAdd')}
						tags={form.addTags}
						onChange={(tags) => update('addTags', tags)}
					/>
				)}
				{has('tagsRemove') && (
					<TagListInput
						id="bulk-edit-tags-remove"
						label={t('tagsRemove')}
						tags={form.removeTags}
						onChange={(tags) => update('removeTags', tags)}
					/>
				)}

				<div className={styles.grid}>
					{extraFields}

					{has('condition') && (
						<div className={styles.field}>
							<label className={styles.label} htmlFor="bulk-edit-condition">
								{t('condition')}
							</label>
							<select
								id="bulk-edit-condition"
								className={styles.select}
								value={form.condition}
								onChange={(e) => update('condition', e.target.value as CardCondition | '')}
							>
								<option value="">{t('leaveUnchanged')}</option>
								{CONDITIONS.map((c) => (
									<option key={c} value={c}>
										{c}
									</option>
								))}
							</select>
						</div>
					)}

					{has('language') && (
						<div className={styles.field}>
							<label className={styles.label} htmlFor="bulk-edit-language">
								{t('language')}
							</label>
							<select
								id="bulk-edit-language"
								className={styles.select}
								value={form.language}
								onChange={(e) => update('language', e.target.value as MtgLanguage | '')}
							>
								<option value="">{t('leaveUnchanged')}</option>
								{MTG_LANGUAGES.map((lang) => (
									<option key={lang} value={lang}>
										{lang}
									</option>
								))}
							</select>
						</div>
					)}

					{has('finish') && triSelect('bulk-edit-foil', t('foil'), 'foil')}

					{has('finish') && form.foil === 'true' && (
						<div className={styles.field}>
							<label className={styles.label} htmlFor="bulk-edit-foiltype">
								{t('foilType')}
							</label>
							<select
								id="bulk-edit-foiltype"
								className={styles.select}
								value={form.foilType}
								onChange={(e) => update('foilType', e.target.value as 'foil' | 'etched')}
							>
								<option value="foil">foil</option>
								<option value="etched">etched</option>
							</select>
						</div>
					)}

					{has('proxy') && triSelect('bulk-edit-proxy', t('proxy'), 'proxy')}
					{has('forTrade') && triSelect('bulk-edit-fortrade', t('forTrade'), 'forTrade')}
					{has('alter') && triSelect('bulk-edit-alter', t('altered'), 'alter')}

					{has('purchasePrice') && (
						<div className={styles.field}>
							<label className={styles.label} htmlFor="bulk-edit-price">
								{t('purchasePrice')}
							</label>
							<input
								id="bulk-edit-price"
								type="text"
								inputMode="decimal"
								className={styles.input}
								value={form.purchasePrice}
								placeholder={t('leaveUnchanged')}
								onChange={(e) => update('purchasePrice', e.target.value)}
							/>
						</div>
					)}
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
