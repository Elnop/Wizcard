'use client';

import {
	ArrowClockwise,
	ArrowCounterClockwise,
	DownloadSimple,
	FloppyDisk,
	Plus,
	Trash,
} from '@phosphor-icons/react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/Button/Button';
import type { CardQuality } from '@/lib/card-editor/quality';
import { QualitySelect } from '../QualitySelect/QualitySelect';
import styles from './EditorToolbar.module.css';

interface EditorToolbarProps {
	hasBackFace: boolean;
	activeFace: 0 | 1;
	canUndo: boolean;
	canRedo: boolean;
	isSaving: boolean;
	isAuthLoading: boolean;
	autosaveStatus: 'saving' | 'saved' | 'unavailable';
	onFaceChange: (face: 0 | 1) => void;
	onAddBackFace: () => void;
	onRemoveBackFace: () => void;
	onUndo: () => void;
	onRedo: () => void;
	onReset: () => void;
	onExport: () => void;
	onSave: () => void;
	previewQuality: CardQuality;
	exportQuality: CardQuality;
	onPreviewQualityChange: (quality: CardQuality) => void;
	onExportQualityChange: (quality: CardQuality) => void;
}

export function EditorToolbar({
	hasBackFace,
	activeFace,
	canUndo,
	canRedo,
	isSaving,
	isAuthLoading,
	autosaveStatus,
	onFaceChange,
	onAddBackFace,
	onRemoveBackFace,
	onUndo,
	onRedo,
	onReset,
	onExport,
	onSave,
	previewQuality,
	exportQuality,
	onPreviewQualityChange,
	onExportQualityChange,
}: EditorToolbarProps) {
	const t = useTranslations('cardEditor.toolbar');
	const tQuality = useTranslations('cardEditor.quality');
	return (
		<header className={styles.toolbar}>
			<div className={styles.brandBlock}>
				<h1>{t('title')}</h1>
				<span className={styles.autosave} data-status={autosaveStatus}>
					<i /> {t(`autosave.${autosaveStatus}`)}
				</span>
			</div>

			<div className={styles.centerTools}>
				<div className={styles.historyTools}>
					<button
						type="button"
						onClick={onUndo}
						disabled={!canUndo}
						aria-label={t('undo')}
						title={t('undo')}
					>
						<ArrowCounterClockwise size={20} />
					</button>
					<button
						type="button"
						onClick={onRedo}
						disabled={!canRedo}
						aria-label={t('redo')}
						title={t('redo')}
					>
						<ArrowClockwise size={20} />
					</button>
				</div>
				<div className={styles.faceTools}>
					<button
						type="button"
						className={activeFace === 0 ? styles.faceActive : ''}
						onClick={() => onFaceChange(0)}
					>
						{t('front')}
					</button>
					{hasBackFace ? (
						<>
							<button
								type="button"
								className={activeFace === 1 ? styles.faceActive : ''}
								onClick={() => onFaceChange(1)}
							>
								{t('back')}
							</button>
							<button
								type="button"
								className={styles.removeFace}
								onClick={onRemoveBackFace}
								aria-label={t('removeBack')}
								title={t('removeBack')}
							>
								<Trash size={17} />
							</button>
						</>
					) : (
						<button type="button" onClick={onAddBackFace}>
							<Plus size={16} />
							{t('addBack')}
						</button>
					)}
				</div>
				<button type="button" className={styles.resetButton} onClick={onReset}>
					{t('reset')}
				</button>
			</div>

			<div className={styles.actions}>
				<Button variant="secondary" size="sm" onClick={onExport}>
					<DownloadSimple size={18} />
					{t('export')}
				</Button>
				<Button size="sm" onClick={onSave} isLoading={isSaving} disabled={isAuthLoading}>
					<FloppyDisk size={18} />
					{t('save')}
				</Button>
			</div>

			{/*
			 * Rangée PROPRE pour les paliers, et non dans `.actions` : la grille du
			 * haut a trois colonnes déjà pleines, et y glisser deux champs les
			 * écrasait à 21 px de large avec des libellés empilés.
			 *
			 * Deux sélecteurs plutôt qu'un : l'aperçu se redessine à chaque frappe
			 * et privilégie la fluidité, l'export est ponctuel et privilégie la
			 * résolution. Un réglage commun forcerait à dégrader l'un pour l'autre.
			 */}
			<div className={styles.qualityRow}>
				<QualitySelect
					id="preview-quality"
					value={previewQuality}
					onChange={onPreviewQualityChange}
					label={tQuality('previewLabel')}
				/>
				<QualitySelect
					id="export-quality"
					value={exportQuality}
					onChange={onExportQualityChange}
					label={tQuality('exportLabel')}
				/>
			</div>
		</header>
	);
}
