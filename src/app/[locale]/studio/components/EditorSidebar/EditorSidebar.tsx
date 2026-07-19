'use client';

import { useRef, useState, type DragEvent } from 'react';
import {
	CardsThree,
	ImageSquare,
	MagicWand,
	SlidersHorizontal,
	UploadSimple,
} from '@phosphor-icons/react';
import { useTranslations } from 'next-intl';
import { CARD_LAYOUT_LIST } from '@/lib/card-editor/layout-registry';
import { prepareArtwork } from '@/lib/card-editor/image';
import { layoutForMseTemplate, type MseTemplate } from '@/lib/card-editor/mse-assets';
import {
	FRAME_STYLE_IDS,
	type CardArtworkDraft,
	type CardFaceDraft,
	type CustomCardDraft,
	type EditableCardField,
} from '@/lib/card-editor/types';
import { MseTemplatePicker } from '../MseTemplatePicker/MseTemplatePicker';
import styles from './EditorSidebar.module.css';

export type EditorPanel = 'card' | 'art' | 'style' | 'details';

interface EditorSidebarProps {
	draft: CustomCardDraft;
	face: CardFaceDraft;
	activePanel: EditorPanel;
	validationErrors: string[];
	mseTemplates: MseTemplate[];
	isMseCatalogLoading: boolean;
	hasMseCatalogError: boolean;
	onPanelChange: (panel: EditorPanel) => void;
	onFieldChange: (field: EditableCardField, value: string) => void;
	onArtworkChange: (artwork: CardArtworkDraft) => void;
	onFaceAppearanceChange: (
		values: Partial<Pick<CardFaceDraft, 'frameStyle' | 'accentColor'>>
	) => void;
	onDraftChange: (values: Partial<CustomCardDraft>) => void;
}

const PANEL_ICONS = {
	card: CardsThree,
	art: ImageSquare,
	style: MagicWand,
	details: SlidersHorizontal,
};

const MANA_SYMBOLS = ['{W}', '{U}', '{B}', '{R}', '{G}', '{C}', '{1}', '{X}', '{T}'];
const LANGUAGE_CODES = ['en', 'fr', 'de', 'es', 'it', 'pt', 'ja', 'ko', 'ru', 'zhs'] as const;

function PanelTabs({
	activePanel,
	onPanelChange,
}: Pick<EditorSidebarProps, 'activePanel' | 'onPanelChange'>) {
	const t = useTranslations('cardEditor.tabs');
	return (
		<div className={styles.tabs} role="tablist">
			{(['card', 'art', 'style', 'details'] as EditorPanel[]).map((panel) => {
				const Icon = PANEL_ICONS[panel];
				return (
					<button
						key={panel}
						type="button"
						role="tab"
						aria-selected={activePanel === panel}
						className={activePanel === panel ? styles.tabActive : styles.tab}
						onClick={() => onPanelChange(panel)}
					>
						<Icon size={19} weight={activePanel === panel ? 'fill' : 'regular'} />
						{t(panel)}
					</button>
				);
			})}
		</div>
	);
}

function FormField({
	label,
	hint,
	error,
	children,
}: {
	label: string;
	hint?: string;
	error?: boolean;
	children: React.ReactNode;
}) {
	return (
		<label className={`${styles.field} ${error ? styles.fieldError : ''}`}>
			<span className={styles.fieldLabel}>{label}</span>
			{children}
			{hint && <span className={styles.fieldHint}>{hint}</span>}
		</label>
	);
}

function CardFieldsPanel({
	face,
	draft,
	validationErrors,
	onFieldChange,
}: Pick<EditorSidebarProps, 'face' | 'draft' | 'validationErrors' | 'onFieldChange'>) {
	const t = useTranslations('cardEditor.fields');
	const isPlaneswalker = draft.layoutId === 'planeswalker';
	function appendMana(symbol: string) {
		onFieldChange('manaCost', `${face.manaCost}${symbol}`);
	}
	return (
		<div className={styles.panelContent}>
			<div className={styles.panelIntro}>
				<h2>{t('title')}</h2>
				<p>{t('directHint')}</p>
			</div>
			<FormField label={t('name')} error={validationErrors.includes('name')}>
				<input
					value={face.name}
					onChange={(event) => onFieldChange('name', event.target.value)}
					maxLength={80}
					placeholder={t('namePlaceholder')}
				/>
			</FormField>
			<FormField label={t('manaCost')} hint={t('manaHint')}>
				<input
					value={face.manaCost}
					onChange={(event) => onFieldChange('manaCost', event.target.value)}
					maxLength={80}
					placeholder="{2}{U}{R}"
				/>
				<span className={styles.symbolBar}>
					{MANA_SYMBOLS.map((symbol) => (
						<button
							key={symbol}
							type="button"
							onClick={() => appendMana(symbol)}
							aria-label={t('insertSymbol', { symbol })}
						>
							{symbol.replace(/[{}]/g, '')}
						</button>
					))}
				</span>
			</FormField>
			<FormField label={t('typeLine')} error={validationErrors.includes('type')}>
				<input
					value={face.typeLine}
					onChange={(event) => onFieldChange('typeLine', event.target.value)}
					maxLength={120}
					placeholder={t('typePlaceholder')}
				/>
			</FormField>
			<FormField label={t('rules')} hint={t('rulesHint')}>
				<textarea
					value={face.oracleText}
					onChange={(event) => onFieldChange('oracleText', event.target.value)}
					maxLength={1600}
					rows={7}
					placeholder={t('rulesPlaceholder')}
				/>
			</FormField>
			<FormField label={t('flavor')}>
				<textarea
					value={face.flavorText}
					onChange={(event) => onFieldChange('flavorText', event.target.value)}
					maxLength={320}
					rows={3}
					placeholder={t('flavorPlaceholder')}
				/>
			</FormField>
			{isPlaneswalker ? (
				<FormField label={t('loyalty')}>
					<input
						value={face.loyalty}
						onChange={(event) => onFieldChange('loyalty', event.target.value)}
						maxLength={8}
						inputMode="numeric"
					/>
				</FormField>
			) : (
				<div className={styles.fieldRow}>
					<FormField label={t('power')}>
						<input
							value={face.power}
							onChange={(event) => onFieldChange('power', event.target.value)}
							maxLength={8}
						/>
					</FormField>
					<FormField label={t('toughness')}>
						<input
							value={face.toughness}
							onChange={(event) => onFieldChange('toughness', event.target.value)}
							maxLength={8}
						/>
					</FormField>
				</div>
			)}
			<FormField label={t('artist')}>
				<input
					value={face.artist}
					onChange={(event) => onFieldChange('artist', event.target.value)}
					maxLength={100}
					placeholder={t('artistPlaceholder')}
				/>
			</FormField>
		</div>
	);
}

function ArtworkPanel({
	face,
	validationErrors,
	onArtworkChange,
}: Pick<EditorSidebarProps, 'face' | 'validationErrors' | 'onArtworkChange'>) {
	const t = useTranslations('cardEditor.art');
	const fileInput = useRef<HTMLInputElement>(null);
	const [error, setError] = useState('');
	const [isDragging, setIsDragging] = useState(false);

	async function processFile(file?: File) {
		if (!file) return;
		setError('');
		try {
			const prepared = await prepareArtwork(file);
			onArtworkChange({ ...prepared, zoom: 1, offsetX: 0, offsetY: 0 });
		} catch (caught) {
			const code = caught instanceof Error ? caught.message : 'unreadable';
			setError(t(`errors.${code === 'tooLarge' || code === 'unsupported' ? code : 'unreadable'}`));
		}
	}

	function handleDrop(event: DragEvent<HTMLButtonElement>) {
		event.preventDefault();
		setIsDragging(false);
		void processFile(event.dataTransfer.files[0]);
	}

	return (
		<div className={styles.panelContent}>
			<div className={styles.panelIntro}>
				<h2>{t('title')}</h2>
				<p>{t('description')}</p>
			</div>
			<input
				ref={fileInput}
				className={styles.hiddenInput}
				type="file"
				accept="image/png,image/jpeg,image/webp,image/avif"
				onChange={(event) => void processFile(event.target.files?.[0])}
			/>
			<button
				type="button"
				className={`${styles.dropZone} ${isDragging ? styles.dropZoneDragging : ''} ${validationErrors.includes('artwork') ? styles.dropZoneError : ''}`}
				onClick={() => fileInput.current?.click()}
				onDragEnter={() => setIsDragging(true)}
				onDragLeave={() => setIsDragging(false)}
				onDragOver={(event) => event.preventDefault()}
				onDrop={handleDrop}
			>
				{face.artwork.dataUrl ? (
					<>
						{/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
						<img src={face.artwork.dataUrl} alt="" />
						<span className={styles.dropZoneOverlay}>
							<UploadSimple size={22} />
							{t('replace')}
						</span>
					</>
				) : (
					<>
						<UploadSimple size={30} />
						<strong>{t('drop')}</strong>
						<span>{t('formats')}</span>
					</>
				)}
			</button>
			{error && (
				<p className={styles.errorMessage} role="alert">
					{error}
				</p>
			)}
			{face.artwork.dataUrl && (
				<div className={styles.cropControls}>
					<FormField label={t('zoom')}>
						<input
							type="range"
							min="1"
							max="3"
							step="0.01"
							value={face.artwork.zoom}
							onChange={(event) =>
								onArtworkChange({ ...face.artwork, zoom: Number(event.target.value) })
							}
						/>
					</FormField>
					<div className={styles.fieldRow}>
						<FormField label={t('horizontal')}>
							<input
								type="range"
								min="-50"
								max="50"
								step="1"
								value={face.artwork.offsetX}
								onChange={(event) =>
									onArtworkChange({ ...face.artwork, offsetX: Number(event.target.value) })
								}
							/>
						</FormField>
						<FormField label={t('vertical')}>
							<input
								type="range"
								min="-50"
								max="50"
								step="1"
								value={face.artwork.offsetY}
								onChange={(event) =>
									onArtworkChange({ ...face.artwork, offsetY: Number(event.target.value) })
								}
							/>
						</FormField>
					</div>
					<button
						type="button"
						className={styles.textButton}
						onClick={() => onArtworkChange({ ...face.artwork, zoom: 1, offsetX: 0, offsetY: 0 })}
					>
						{t('resetCrop')}
					</button>
					<p className={styles.tip}>{t('dragTip')}</p>
				</div>
			)}
		</div>
	);
}

function StylePanel({
	draft,
	face,
	mseTemplates,
	isMseCatalogLoading,
	hasMseCatalogError,
	onDraftChange,
	onFaceAppearanceChange,
}: Pick<
	EditorSidebarProps,
	| 'draft'
	| 'face'
	| 'mseTemplates'
	| 'isMseCatalogLoading'
	| 'hasMseCatalogError'
	| 'onDraftChange'
	| 'onFaceAppearanceChange'
>) {
	const t = useTranslations('cardEditor.style');
	const layouts = useTranslations('cardEditor.layouts');
	return (
		<div className={styles.panelContent}>
			<div className={styles.panelIntro}>
				<h2>{t('title')}</h2>
				<p>{t('description')}</p>
			</div>
			<MseTemplatePicker
				templates={mseTemplates}
				selectedId={draft.mseTemplateId}
				isLoading={isMseCatalogLoading}
				hasError={hasMseCatalogError}
				onSelect={(template) =>
					onDraftChange({
						mseTemplateId: template.id,
						layoutId: layoutForMseTemplate(template),
					})
				}
			/>
			<fieldset className={styles.fieldset}>
				<legend>{t('layout')}</legend>
				<div className={styles.layoutGrid}>
					{CARD_LAYOUT_LIST.map((layout) => (
						<button
							key={layout.id}
							type="button"
							className={draft.layoutId === layout.id ? styles.layoutActive : styles.layoutCard}
							onClick={() => onDraftChange({ layoutId: layout.id })}
						>
							<span className={styles.layoutPreview} data-layout={layout.id}>
								<i />
								<i />
								<i />
							</span>
							<strong>{layouts(`${layout.labelKey}.name`)}</strong>
							<small>{layouts(`${layout.descriptionKey}.description`)}</small>
						</button>
					))}
				</div>
			</fieldset>
			<fieldset className={styles.fieldset}>
				<legend>{t('frame')}</legend>
				<div className={styles.swatchGrid}>
					{FRAME_STYLE_IDS.map((frame) => (
						<button
							key={frame}
							type="button"
							data-frame={frame}
							className={face.frameStyle === frame ? styles.swatchActive : styles.swatch}
							onClick={() => onFaceAppearanceChange({ frameStyle: frame })}
						>
							<span />
							{t(`frames.${frame}`)}
						</button>
					))}
				</div>
			</fieldset>
			<div className={styles.fieldRow}>
				<FormField label={t('accent')}>
					<input
						type="color"
						value={face.accentColor}
						onChange={(event) => onFaceAppearanceChange({ accentColor: event.target.value })}
					/>
				</FormField>
				<FormField label={t('finish')}>
					<select
						value={draft.finish}
						onChange={(event) =>
							onDraftChange({ finish: event.target.value as CustomCardDraft['finish'] })
						}
					>
						<option value="matte">{t('finishes.matte')}</option>
						<option value="foil">{t('finishes.foil')}</option>
						<option value="etched">{t('finishes.etched')}</option>
					</select>
				</FormField>
			</div>
		</div>
	);
}

function DetailsPanel({
	draft,
	onDraftChange,
}: Pick<EditorSidebarProps, 'draft' | 'onDraftChange'>) {
	const t = useTranslations('cardEditor.details');
	return (
		<div className={styles.panelContent}>
			<div className={styles.panelIntro}>
				<h2>{t('title')}</h2>
				<p>{t('description')}</p>
			</div>
			<FormField label={t('setName')}>
				<input
					value={draft.setName}
					onChange={(event) => onDraftChange({ setName: event.target.value })}
					maxLength={80}
				/>
			</FormField>
			<div className={styles.fieldRow}>
				<FormField label={t('setCode')}>
					<input
						value={draft.setCode}
						onChange={(event) =>
							onDraftChange({
								setCode: event.target.value
									.toUpperCase()
									.replace(/[^A-Z0-9]/g, '')
									.slice(0, 6),
							})
						}
						maxLength={6}
					/>
				</FormField>
				<FormField label={t('number')}>
					<input
						value={draft.collectorNumber}
						onChange={(event) => onDraftChange({ collectorNumber: event.target.value })}
						maxLength={12}
					/>
				</FormField>
			</div>
			<div className={styles.fieldRow}>
				<FormField label={t('rarity')}>
					<select
						value={draft.rarity}
						onChange={(event) =>
							onDraftChange({ rarity: event.target.value as CustomCardDraft['rarity'] })
						}
					>
						<option value="common">{t('rarities.common')}</option>
						<option value="uncommon">{t('rarities.uncommon')}</option>
						<option value="rare">{t('rarities.rare')}</option>
						<option value="mythic">{t('rarities.mythic')}</option>
					</select>
				</FormField>
				<FormField label={t('language')}>
					<select
						value={draft.language}
						onChange={(event) => onDraftChange({ language: event.target.value })}
					>
						{LANGUAGE_CODES.map((code) => (
							<option key={code} value={code}>
								{t(`languages.${code}`)}
							</option>
						))}
					</select>
				</FormField>
			</div>
			<FormField label={t('tags')} hint={t('tagsHint')}>
				<input
					value={draft.tags}
					onChange={(event) => onDraftChange({ tags: event.target.value })}
					maxLength={240}
					placeholder={t('tagsPlaceholder')}
				/>
			</FormField>
			<label className={styles.visibilityCard}>
				<span>
					<strong>{t('public')}</strong>
					<small>{t('publicHint')}</small>
				</span>
				<input
					type="checkbox"
					checked={draft.isPublic}
					onChange={(event) => onDraftChange({ isPublic: event.target.checked })}
				/>
			</label>
		</div>
	);
}

export function EditorSidebar(props: EditorSidebarProps) {
	return (
		<aside className={styles.sidebar}>
			<PanelTabs activePanel={props.activePanel} onPanelChange={props.onPanelChange} />
			<div className={styles.panel} role="tabpanel">
				{props.activePanel === 'card' && <CardFieldsPanel {...props} />}
				{props.activePanel === 'art' && <ArtworkPanel {...props} />}
				{props.activePanel === 'style' && <StylePanel {...props} />}
				{props.activePanel === 'details' && <DetailsPanel {...props} />}
			</div>
		</aside>
	);
}
