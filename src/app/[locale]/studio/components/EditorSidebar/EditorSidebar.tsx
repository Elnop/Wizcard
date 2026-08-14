'use client';

import { useRef, useState, type DragEvent } from 'react';
import {
	CaretRight,
	CardsThree,
	ImageSquare,
	SlidersHorizontal,
	SquaresFour,
	UploadSimple,
} from '@phosphor-icons/react';
import { useTranslations } from 'next-intl';
import { artPanBounds, clampOffset, UNKNOWN_PAN_LIMIT } from '@/lib/card-editor/art-pan';
import { prepareArtwork } from '@/lib/card-editor/image';
import { type MseTemplate } from '@/lib/card-editor/mse-assets';
import { templateGeometry } from '@/lib/card-editor/template-geometry';
import { getManaSymbols, MAX_MANA_PIPS, type RulesCapacity } from '@/lib/card-editor/text-layout';
import { ManaSymbol } from '@/lib/scryfall/components/ManaSymbol/ManaSymbol';
import { useScryfallSymbols } from '@/lib/scryfall/hooks/useScryfallSymbols';
import {
	CARD_FIELD_MAX_LENGTH,
	DRAFT_FIELD_MAX_LENGTH,
	FRAME_STYLE_IDS,
	type CardArtworkDraft,
	type CardFaceDraft,
	type CustomCardDraft,
	type EditableCardField,
} from '@/lib/card-editor/types';
import { MseTemplatePicker } from '../MseTemplatePicker/MseTemplatePicker';
import { TypeLineField } from '../TypeLineField/TypeLineField';
import styles from './EditorSidebar.module.css';

export type EditorPanel = 'card' | 'art' | 'style' | 'details';

interface EditorSidebarProps {
	draft: CustomCardDraft;
	face: CardFaceDraft;
	activePanel: EditorPanel;
	validationErrors: string[];
	/** Capacité de la zone de texte du layout courant (lignes x chars/ligne). */
	rulesCapacity: RulesCapacity;
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

/* `style` est resté la CLÉ de l'onglet (elle porte tout son sous-arbre de
   messages : layouts, frames, finishes) mais s'affiche « Layout ». */
const PANEL_ICONS = {
	card: CardsThree,
	style: SquaresFour,
	art: ImageSquare,
	details: SlidersHorizontal,
};

/**
 * Symboles insérables d'un clic, groupés par famille — une palette plate de 34
 * boutons serait illisible.
 *
 * Absents volontaires :
 * - le générique simple ({1}, {2}…), qui a son propre compteur ;
 * - {T} (tap), coût d'ACTIVATION qui apparaît dans le texte de règles, jamais
 *   dans un coût de mana.
 *
 * Les familles suivent la nomenclature Scryfall (/symbology) :
 * - hybrides colorés : payables par l'une OU l'autre couleur ({W/U}) ;
 * - hybrides génériques : 2 génériques OU une couleur ({2/W}) — c'est le
 *   « générique coloré » ;
 * - phyrexians : payables par une couleur OU 2 points de vie ({W/P}).
 */
const MANA_SYMBOL_GROUPS = [
	{ id: 'basic', symbols: ['{W}', '{U}', '{B}', '{R}', '{G}', '{C}', '{X}', '{S}'] },
	{
		// Hybrides : d'abord les bicolores ({W/U}, payables par l'une OU l'autre
		// couleur), puis les « génériques colorés » ({2/W} : 2 génériques OU la
		// couleur). Deux formes d'une même idée — on cherche « un hybride » sans
		// distinguer laquelle, d'où une seule famille.
		id: 'hybrid',
		symbols: [
			'{W/U}',
			'{U/B}',
			'{B/R}',
			'{R/G}',
			'{G/W}',
			'{W/B}',
			'{U/R}',
			'{B/G}',
			'{R/W}',
			'{G/U}',
			'{2/W}',
			'{2/U}',
			'{2/B}',
			'{2/R}',
			'{2/G}',
		],
	},
	{
		// Phyrexians : d'abord les monocolores ({W/P} : la couleur OU 2 points de
		// vie), puis les hybrides phyrexians de New Phyrexia ({W/U/P} : l'une des
		// deux couleurs OU 2 points de vie).
		id: 'phyrexian',
		symbols: [
			'{W/P}',
			'{U/P}',
			'{B/P}',
			'{R/P}',
			'{G/P}',
			'{C/P}',
			'{W/U/P}',
			'{U/B/P}',
			'{B/R/P}',
			'{R/G/P}',
			'{G/W/P}',
			'{W/B/P}',
			'{U/R/P}',
			'{B/G/P}',
			'{R/W/P}',
			'{G/U/P}',
		],
	},
	{
		// Symboles rares ou issus des Un-sets, marqués `appears_in_mana_costs` par
		// Scryfall : {Y}/{Z} (génériques variables) et {HW} (demi-mana blanc).
		//
		// {L} (source légendaire) et {D} (land drop) sont volontairement absents :
		// leurs SVG sont de simples glyphes NOIRS sans pastille de fond, donc
		// invisibles sur le thème sombre. Ils restent saisissables à la main.
		id: 'exotic',
		symbols: ['{Y}', '{Z}', '{HW}'],
	},
] as const;

/** Coût générique en tête d'un coût de mana : {3}{U}{U} -> 3. */
function readGenericMana(manaCost: string): number | null {
	const match = /^\{(\d+)\}/.exec(manaCost.trim());
	return match ? Number(match[1]) : null;
}

/**
 * Réécrit la partie générique en conservant les symboles colorés.
 *
 * Le générique est par convention en PREMIÈRE position d'un coût ({2}{U}{R}),
 * donc on remplace ou insère en tête plutôt que d'ajouter à la suite.
 * `amount` à 0 ou null le retire — un coût purement coloré n'a pas de {0}.
 */
function writeGenericMana(manaCost: string, amount: number | null): string {
	const rest = manaCost.trim().replace(/^\{\d+\}/, '');
	if (!amount || amount < 1) return rest;
	return `{${amount}}${rest}`;
}
const LANGUAGE_CODES = ['en', 'fr', 'de', 'es', 'it', 'pt', 'ja', 'ko', 'ru', 'zhs'] as const;

function PanelTabs({
	activePanel,
	onPanelChange,
}: Pick<EditorSidebarProps, 'activePanel' | 'onPanelChange'>) {
	const t = useTranslations('cardEditor.tabs');
	return (
		<div className={styles.tabs} role="tablist">
			{/* Le gabarit se choisit AVANT l'illustration : il fixe la forme de la
			    zone d'art, donc le cadrage qu'on lui donnera ensuite. */}
			{(['card', 'style', 'art', 'details'] as EditorPanel[]).map((panel) => {
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

/**
 * Éditeur de coût de mana : aperçu du coût courant, compteur pour le générique
 * et palette de symboles colorés — tous rendus avec les SVG officiels Scryfall
 * (mêmes visuels que le reste de l'app, cf. ManaSymbol/SymbolText).
 *
 * Le champ texte reste la source de vérité et demeure éditable à la main : les
 * commandes ne sont qu'un raccourci, ce qui laisse la porte ouverte aux
 * symboles exotiques ({W/U}, {2/R}, {U/P}…) sans avoir à tous les câbler.
 */
function ManaCostField({
	manaCost,
	onChange,
}: {
	manaCost: string;
	onChange: (value: string) => void;
}) {
	const t = useTranslations('cardEditor.fields');
	const symbolMap = useScryfallSymbols();
	// Une seule famille ouverte à la fois : les 6 dépliées rempliraient l'écran.
	const [openSymbolGroup, setOpenSymbolGroup] = useState<string | null>('basic');
	const generic = readGenericMana(manaCost);
	const preview = getManaSymbols(manaCost);
	const isPipLimitReached = preview.length >= MAX_MANA_PIPS;
	// Passer de « pas de générique » à un générique AJOUTE un pip ; le modifier
	// quand il existe déjà n'en ajoute aucun.
	const genericWouldAddPip = generic === null;

	// `fieldset` plutôt que le `label` de FormField : ce bloc contient plusieurs
	// contrôles (texte, compteur, boutons), qu'un unique <label> ne peut pas
	// décrire correctement.
	return (
		<fieldset className={styles.field}>
			<legend className={styles.fieldLabel}>{t('manaCost')}</legend>
			<span className={styles.fieldHint}>{t('manaHint')}</span>
			<div className={styles.manaPreview} aria-live="polite">
				{preview.length === 0 ? (
					<span className={styles.manaPreviewEmpty}>{t('manaEmpty')}</span>
				) : (
					preview.map((symbol, index) => (
						<ManaSymbol
							key={`${symbol}-${index}`}
							symbol={`{${symbol}}`}
							symbolMap={symbolMap}
							size={22}
						/>
					))
				)}
			</div>
			<input
				value={manaCost}
				onChange={(event) => onChange(event.target.value)}
				maxLength={CARD_FIELD_MAX_LENGTH.manaCost}
				placeholder="{2}{U}{R}"
				aria-label={t('manaCost')}
			/>
			<div className={styles.genericRow}>
				<label className={styles.genericLabel} htmlFor="mana-generic">
					{t('genericMana')}
				</label>
				<div className={styles.genericControls}>
					<button
						type="button"
						onClick={() => onChange(writeGenericMana(manaCost, (generic ?? 0) - 1))}
						disabled={!generic}
						aria-label={t('genericDecrease')}
					>
						−
					</button>
					<input
						id="mana-generic"
						type="number"
						min={0}
						max={20}
						value={generic ?? ''}
						placeholder="0"
						onChange={(event) => {
							const raw = event.target.value;
							if (raw === '') return onChange(writeGenericMana(manaCost, null));
							const parsed = Number.parseInt(raw, 10);
							if (Number.isNaN(parsed)) return;
							onChange(writeGenericMana(manaCost, Math.min(20, Math.max(0, parsed))));
						}}
					/>
					<button
						type="button"
						onClick={() => onChange(writeGenericMana(manaCost, Math.min(20, (generic ?? 0) + 1)))}
						disabled={(generic ?? 0) >= 20 || (isPipLimitReached && genericWouldAddPip)}
						aria-label={t('genericIncrease')}
					>
						+
					</button>
				</div>
			</div>
			{/*
			 * Accordéon : 44 symboles répartis en 6 familles occuperaient tout le
			 * panneau. Seule la famille de base est ouverte par défaut — c'est celle
			 * qui sert dans l'immense majorité des cas.
			 */}
			{MANA_SYMBOL_GROUPS.map((group) => {
				const isOpen = openSymbolGroup === group.id;
				return (
					<div key={group.id} className={styles.symbolGroup}>
						<button
							type="button"
							className={styles.symbolGroupToggle}
							onClick={() => setOpenSymbolGroup(isOpen ? null : group.id)}
							aria-expanded={isOpen}
						>
							<CaretRight size={12} weight="bold" data-open={isOpen || undefined} />
							{t(`manaGroups.${group.id}`)}
							<span className={styles.symbolGroupCount}>{group.symbols.length}</span>
						</button>
						{isOpen && (
							<span className={styles.symbolBar}>
								{group.symbols.map((symbol) => (
									<button
										key={symbol}
										type="button"
										onClick={() => onChange(`${manaCost}${symbol}`)}
										// À la limite de pips, l'ajout serait retiré par clampManaCost :
										// mieux vaut désactiver que laisser cliquer sans effet.
										disabled={isPipLimitReached}
										aria-label={t('insertSymbol', { symbol })}
										title={symbolMap[symbol]?.english ?? symbol}
									>
										<ManaSymbol symbol={symbol} symbolMap={symbolMap} size={22} />
									</button>
								))}
							</span>
						)}
					</div>
				);
			})}
		</fieldset>
	);
}

function CardFieldsPanel({
	face,
	draft,
	validationErrors,
	rulesCapacity,
	onFieldChange,
}: Pick<
	EditorSidebarProps,
	'face' | 'draft' | 'validationErrors' | 'rulesCapacity' | 'onFieldChange'
>) {
	const t = useTranslations('cardEditor.fields');
	const isPlaneswalker = draft.layoutId === 'planeswalker';
	return (
		<div className={styles.panelContent}>
			<FormField label={t('name')} error={validationErrors.includes('name')}>
				<input
					value={face.name}
					onChange={(event) => onFieldChange('name', event.target.value)}
					maxLength={CARD_FIELD_MAX_LENGTH.name}
					placeholder={t('namePlaceholder')}
				/>
			</FormField>
			<ManaCostField
				manaCost={face.manaCost}
				onChange={(value) => onFieldChange('manaCost', value)}
			/>
			<TypeLineField
				typeLine={face.typeLine}
				onChange={(value) => onFieldChange('typeLine', value)}
				hasError={validationErrors.includes('type')}
			/>
			{/*
			 * Règles et ambiance se partagent la zone de texte : leur limite est sa
			 * CAPACITÉ (lignes x caractères/ligne), qui dépend du layout — de 116
			 * caractères sur un jeton à 1023 sur une saga. Le compteur affiche le
			 * remplissage plutôt qu'un plafond abstrait.
			 */}
			<FormField
				label={t('rules')}
				hint={t('capacityHint', {
					lines: rulesCapacity.lines,
					perLine: rulesCapacity.charactersPerLine,
				})}
			>
				<textarea
					value={face.oracleText}
					onChange={(event) => onFieldChange('oracleText', event.target.value)}
					maxLength={rulesCapacity.total}
					rows={7}
					placeholder={t('rulesPlaceholder')}
				/>
				<span className={styles.capacityCount}>
					{face.oracleText.length} / {rulesCapacity.total}
				</span>
			</FormField>
			<FormField label={t('flavor')}>
				<textarea
					value={face.flavorText}
					onChange={(event) => onFieldChange('flavorText', event.target.value)}
					maxLength={rulesCapacity.total}
					rows={3}
					placeholder={t('flavorPlaceholder')}
				/>
				<span className={styles.capacityCount}>
					{face.flavorText.length} / {rulesCapacity.total}
				</span>
			</FormField>
			{isPlaneswalker ? (
				<FormField label={t('loyalty')}>
					<input
						value={face.loyalty}
						onChange={(event) => onFieldChange('loyalty', event.target.value)}
						maxLength={CARD_FIELD_MAX_LENGTH.loyalty}
						inputMode="numeric"
					/>
				</FormField>
			) : (
				<div className={styles.fieldRow}>
					<FormField label={t('power')}>
						<input
							value={face.power}
							onChange={(event) => onFieldChange('power', event.target.value)}
							maxLength={CARD_FIELD_MAX_LENGTH.power}
						/>
					</FormField>
					<FormField label={t('toughness')}>
						<input
							value={face.toughness}
							onChange={(event) => onFieldChange('toughness', event.target.value)}
							maxLength={CARD_FIELD_MAX_LENGTH.toughness}
						/>
					</FormField>
				</div>
			)}
			<FormField label={t('artist')}>
				<input
					value={face.artist}
					onChange={(event) => onFieldChange('artist', event.target.value)}
					maxLength={CARD_FIELD_MAX_LENGTH.artist}
					placeholder={t('artistPlaceholder')}
				/>
			</FormField>
		</div>
	);
}

function ArtworkPanel({
	draft,
	face,
	mseTemplates,
	validationErrors,
	onArtworkChange,
}: Pick<
	EditorSidebarProps,
	'draft' | 'face' | 'mseTemplates' | 'validationErrors' | 'onArtworkChange'
>) {
	const t = useTranslations('cardEditor.art');
	const fileInput = useRef<HTMLInputElement>(null);
	const [error, setError] = useState('');
	const [isDragging, setIsDragging] = useState(false);
	// Mêmes bornes que le glisser sur la carte, calculées depuis la MÊME fonction :
	// les curseurs ne peuvent donc pas écrire une valeur que le rendu refuserait.
	// Sans ça, tirer le curseur au-delà de la marge faisait monter le nombre sans
	// que l'image bouge.
	//
	// La marge est un POURCENTAGE de la boîte, donc invariante à l'échelle : la
	// géométrie du canvas et celle du style MSE donnent le même résultat.
	const artRect = templateGeometry(
		mseTemplates.find((template) => template.id === draft.mseTemplateId)
	)?.art;
	const panBounds = artRect
		? artPanBounds(artRect, face.artwork.width, face.artwork.height, face.artwork.zoom)
		: { maxOffsetX: UNKNOWN_PAN_LIMIT, maxOffsetY: UNKNOWN_PAN_LIMIT };

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
								min={-panBounds.maxOffsetX}
								max={panBounds.maxOffsetX}
								step="0.1"
								disabled={panBounds.maxOffsetX === 0}
								value={clampOffset(face.artwork.offsetX, panBounds.maxOffsetX)}
								onChange={(event) =>
									onArtworkChange({ ...face.artwork, offsetX: Number(event.target.value) })
								}
							/>
						</FormField>
						<FormField label={t('vertical')}>
							<input
								type="range"
								min={-panBounds.maxOffsetY}
								max={panBounds.maxOffsetY}
								step="0.1"
								disabled={panBounds.maxOffsetY === 0}
								value={clampOffset(face.artwork.offsetY, panBounds.maxOffsetY)}
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
	return (
		<div className={styles.panelContent}>
			<div className={styles.panelIntro}>
				<h2>{t('title')}</h2>
				<p>{t('description')}</p>
			</div>
			<MseTemplatePicker
				templates={mseTemplates}
				mseTemplateId={draft.mseTemplateId}
				isLoading={isMseCatalogLoading}
				hasError={hasMseCatalogError}
				// Une seule écriture pour les deux champs : c'est ce qui rend la
				// désynchronisation impossible, là où les deux sélecteurs d'avant
				// s'écrasaient l'un l'autre.
				onSelect={(choice) =>
					onDraftChange({
						mseTemplateId: choice.mseTemplateId,
						layoutId: choice.layoutId,
					})
				}
			/>
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
					maxLength={DRAFT_FIELD_MAX_LENGTH.setName}
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
						maxLength={DRAFT_FIELD_MAX_LENGTH.setCode}
					/>
				</FormField>
				<FormField label={t('number')}>
					<input
						value={draft.collectorNumber}
						onChange={(event) => onDraftChange({ collectorNumber: event.target.value })}
						maxLength={DRAFT_FIELD_MAX_LENGTH.collectorNumber}
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
					maxLength={DRAFT_FIELD_MAX_LENGTH.tags}
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
