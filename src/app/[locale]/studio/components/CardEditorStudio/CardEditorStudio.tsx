'use client';

import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { CheckCircle, Info, WarningCircle } from '@phosphor-icons/react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { CardCanvas } from '@/lib/card-editor/components/CardCanvas/CardCanvas';
import { saveCustomCard } from '@/lib/card-editor/db/custom-card-editor';
import { buildCardFileName, downloadBlob, renderCardPng } from '@/lib/card-editor/export';
import { prepareArtwork } from '@/lib/card-editor/image';
import {
	resolveMseCrownPath,
	resolveMseFramePath,
	resolveMseTextColors,
	useMseTemplateCatalog,
	useSelectedMseTemplate,
	type MseTemplate,
} from '@/lib/card-editor/mse-assets';
import { validateCardDraft } from '@/lib/card-editor/draft';
import { templateGeometry } from '@/lib/card-editor/template-geometry';
import { clampManaCost, getRulesCapacity, type RulesCapacity } from '@/lib/card-editor/text-layout';
import { parseTypeLine } from '@/lib/card-editor/type-line';
import {
	CARD_FIELD_MAX_LENGTH,
	DEFAULT_FRAME_TEMPLATE_ID,
	DRAFT_FIELD_MAX_LENGTH,
	type CardCanvasLabels,
	type CardFaceDraft,
	type EditableCardField,
} from '@/lib/card-editor/types';
import { useCardTypeVocabulary } from '@/lib/scryfall/hooks/useCardTypeVocabulary';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { useCardEditor } from '../../useCardEditor';
import { EditorSidebar, type EditorPanel } from '../EditorSidebar/EditorSidebar';
import { EditorToolbar } from '../EditorToolbar/EditorToolbar';
import styles from './CardEditorStudio.module.css';

type Notice = { type: 'info' | 'error' | 'success'; message: string } | null;

/**
 * Capacité de la zone de règles du gabarit, mesurée à la même source que le
 * rendu (`templateGeometry`) et non plus sur le registre des layouts maison.
 *
 * Gabarit non encore résolu — catalogue en vol, ou brouillon pointant un cadre
 * que l'auto-réparation n'a pas encore corrigé : on retourne la capacité du
 * cadre PAR DÉFAUT, qui est mesuré par construction (cf.
 * DEFAULT_FRAME_TEMPLATE_ID). Rendre la capacité nullable serait contagieux
 * (quatre points d'affichage la lisent), et une capacité nulle TRONQUERAIT le
 * texte de l'utilisateur à chaque rendu pendant le chargement.
 */
function capacityForTemplate(
	template: MseTemplate | undefined,
	templates: MseTemplate[]
): RulesCapacity {
	const rules =
		templateGeometry(template)?.rules ??
		templateGeometry(templates.find((row) => row.id === DEFAULT_FRAME_TEMPLATE_ID))?.rules;
	// Catalogue vide (chargement, erreur réseau) : la zone de règles du cadre M15
	// de référence, en repère canvas. Une valeur généreuse et fixe qui ne coupe
	// aucune saisie ; le bornage réel s'applique dès que le catalogue arrive.
	if (!rules) return getRulesCapacity(630, 294);
	return getRulesCapacity(rules.width, rules.height);
}

function NoticeIcon({ type }: { type: NonNullable<Notice>['type'] }) {
	if (type === 'error') return <WarningCircle size={20} />;
	if (type === 'success') return <CheckCircle size={20} />;
	return <Info size={20} />;
}

export function CardEditorStudio() {
	const locale = useLocale();
	const t = useTranslations('cardEditor');
	const router = useRouter();
	const { user, isLoading: isAuthLoading } = useAuth();
	const editor = useCardEditor(locale);
	const mseCatalog = useMseTemplateCatalog();
	const selectedMseTemplate = useSelectedMseTemplate(
		mseCatalog.templates,
		editor.draft.mseTemplateId
	);
	// Capacité de la zone de texte : elle borne la saisie des règles et de
	// l'ambiance, et alimente le compteur affiché sous les champs.
	//
	// Elle se lisait sur `layoutId` via le registre maison, qui ne décrit plus ce
	// qui est peint : le canvas rend la géométrie MESURÉE du gabarit. Le compteur
	// annonçait donc la capacité d'un gabarit maison retiré, pour un cadre aux
	// proportions différentes. On lit désormais la même source que le rendu.
	const rulesCapacity = capacityForTemplate(selectedMseTemplate, mseCatalog.templates);
	// La couronne se déclenche sur le SUPERTYPE, comme MSE
	// (`match(card.super_type, "Legendary")`) — pas sur une case à cocher. La
	// ligne de type reste la source unique, donc rien ne peut diverger entre ce
	// qui est écrit et ce qui est peint.
	const typeVocabulary = useCardTypeVocabulary();
	const isLegendary = (face: CardFaceDraft) =>
		parseTypeLine(face.typeLine, typeVocabulary).supertypes.includes('Legendary');
	const [activePanel, setActivePanel] = useState<EditorPanel>('card');
	const [validationErrors, setValidationErrors] = useState<string[]>([]);
	const [notice, setNotice] = useState<Notice>(null);
	const [isSaving, setIsSaving] = useState(false);
	const activeSvg = useRef<SVGSVGElement>(null);
	const frontSvg = useRef<SVGSVGElement>(null);
	const backSvg = useRef<SVGSVGElement>(null);

	// Auto-réparation : ramène vers un cadre rendable tout brouillon qui n'en
	// désigne pas un.
	//
	// Cet effet épargnait auparavant le sentinel maison (`wizcard:house`), qui ne
	// résout volontairement aucun gabarit du catalogue. Depuis le retrait des
	// gabarits maison, ce sentinel ne peint plus RIEN : il doit donc être
	// récupéré, pas protégé. Un brouillon autosauvegardé d'avant le retrait passe
	// ici et bascule sur le cadre par défaut.
	//
	// Couvre aussi la géométrie : un gabarit non MESURÉ n'est plus proposé par le
	// sélecteur, mais un vieux brouillon peut encore en porter un — sans
	// géométrie, le canvas ne peindrait rien.
	useEffect(() => {
		if (mseCatalog.isLoading || mseCatalog.error) return;
		if (selectedMseTemplate?.renderMode === 'frame' && selectedMseTemplate.geometry) return;
		const fallback = mseCatalog.templates.find(
			(template) => template.id === DEFAULT_FRAME_TEMPLATE_ID
		);
		if (!fallback) return;
		editor.updateDraft({
			mseTemplateId: fallback.id,
			layoutId: fallback.layoutId ?? 'arcana',
		});
	}, [editor, mseCatalog.error, mseCatalog.isLoading, mseCatalog.templates, selectedMseTemplate]);

	const labels = useMemo<CardCanvasLabels>(
		() => ({
			namePlaceholder: t('canvas.namePlaceholder'),
			typePlaceholder: t('canvas.typePlaceholder'),
			rulesPlaceholder: t('canvas.rulesPlaceholder'),
			artistPrefix: t('canvas.artistPrefix'),
			customMark: t('canvas.customMark'),
			panArtwork: t('canvas.panArtwork'),
			editName: t('canvas.editName'),
			editManaCost: t('canvas.editManaCost'),
			editType: t('canvas.editType'),
			editRules: t('canvas.editRules'),
			editStats: t('canvas.editStats'),
		}),
		[t]
	);

	async function importArtworkFile(file?: File) {
		if (!file?.type.startsWith('image/')) return;
		try {
			const prepared = await prepareArtwork(file);
			editor.updateArtwork({ ...prepared, zoom: 1, offsetX: 0, offsetY: 0 });
			setActivePanel('art');
		} catch {
			setNotice({ type: 'error', message: t('notices.imageError') });
		}
	}

	useEffect(() => {
		function handlePaste(event: ClipboardEvent) {
			if (!event.clipboardData) return;
			const image = [...event.clipboardData.items]
				.find((item) => item.type.startsWith('image/'))
				?.getAsFile();
			if (image) void importArtworkFile(image);
		}
		window.addEventListener('paste', handlePaste);
		return () => window.removeEventListener('paste', handlePaste);
	});

	function handlePreviewDrop(event: DragEvent<HTMLElement>) {
		event.preventDefault();
		void importArtworkFile(event.dataTransfer.files[0]);
	}

	function handleReset() {
		if (window.confirm(t('toolbar.resetConfirm'))) editor.reset();
	}

	async function handleExport() {
		if (!activeSvg.current) return;
		try {
			const blob = await renderCardPng(activeSvg.current);
			downloadBlob(blob, buildCardFileName(editor.activeFace.name, editor.draft.activeFace));
			setNotice({ type: 'success', message: t('notices.exported') });
		} catch {
			setNotice({ type: 'error', message: t('notices.exportError') });
		}
	}

	async function handleSave() {
		const errors = validateCardDraft(editor.draft);
		if (errors.length > 0) {
			setValidationErrors(errors);
			setActivePanel(errors.includes('artwork') ? 'art' : 'card');
			setNotice({ type: 'error', message: t('notices.incomplete') });
			return;
		}
		if (!user) {
			setNotice({ type: 'info', message: t('notices.loginRequired') });
			return;
		}
		if (!frontSvg.current) return;

		setIsSaving(true);
		setNotice({ type: 'info', message: t('notices.saving') });
		try {
			const frontRender = await renderCardPng(frontSvg.current);
			const backRender =
				editor.draft.faces[1] && backSvg.current ? await renderCardPng(backSvg.current) : undefined;
			const cardId = await saveCustomCard({
				draft: editor.draft,
				userId: user.id,
				frontRender,
				backRender,
			});
			setNotice({ type: 'success', message: t('notices.saved') });
			router.push(`/card/${encodeURIComponent(cardId)}`);
		} catch (error) {
			console.error('[card-editor] save failed', error);
			setNotice({ type: 'error', message: t('notices.saveError') });
		} finally {
			setIsSaving(false);
		}
	}

	function handleFieldChange(field: EditableCardField, value: string) {
		setValidationErrors([]);
		setNotice(null);
		// Borner ICI et pas seulement via maxLength : cet attribut ne retient que
		// la frappe. Un collage traité par React, un brouillon restauré ou un
		// champ pré-rempli passent tout droit — 300 caractères atteignaient le
		// state avec un maxLength de 80. Ce handler est le point de passage unique
		// de la sidebar ET de l'édition directe sur la carte.
		const bounded = value.slice(0, CARD_FIELD_MAX_LENGTH[field]);
		// Le coût de mana se borne en NOMBRE DE PIPS, pas en caractères : {15}{W}
		// est court mais {W}×20 déborde de la ligne de titre.
		if (field === 'manaCost') return editor.updateFace(field, clampManaCost(bounded));
		// Règles et ambiance partagent la zone de texte : leur vraie limite est sa
		// capacité (lignes × caractères par ligne), pas un plafond fixe — elle va
		// de 116 caractères sur un jeton à 1023 sur une saga.
		if (field === 'oracleText' || field === 'flavorText') {
			return editor.updateFace(field, bounded.slice(0, rulesCapacity.total));
		}
		editor.updateFace(field, bounded);
	}

	function handleArtworkChange(artwork: Parameters<typeof editor.updateArtwork>[0]) {
		setValidationErrors([]);
		setNotice(null);
		editor.updateArtwork(artwork);
	}

	function handleDraftChange(values: Parameters<typeof editor.updateDraft>[0]) {
		setValidationErrors([]);
		setNotice(null);
		// Même raison que handleFieldChange : maxLength ne retient que la frappe.
		// On ne tronque que les champs texte connus ; les autres (booléens,
		// énumérations d'un <select>) traversent inchangés.
		const bounded = Object.fromEntries(
			Object.entries(values).map(([key, value]) => {
				const limit = DRAFT_FIELD_MAX_LENGTH[key as keyof typeof DRAFT_FIELD_MAX_LENGTH];
				return typeof value === 'string' && limit ? [key, value.slice(0, limit)] : [key, value];
			})
		) as typeof values;
		editor.updateDraft(bounded);

		// Changer de cadre change la capacité de la zone de texte : passer d'une
		// saga (1023) à un jeton (116) laisserait sinon un texte trop long, que le
		// rendu tronquerait silencieusement à l'affichage. On le recadre tout de
		// suite pour que le compteur et la carte disent la même chose.
		//
		// Le déclencheur est `mseTemplateId` et non `layoutId` : c'est le gabarit
		// qui porte la géométrie mesurée. Deux cadres peuvent partager un layoutId
		// tout en ayant des zones de texte très différentes — se fier au layout
		// laissait passer ces changements-là.
		if (bounded.mseTemplateId && bounded.mseTemplateId !== editor.draft.mseTemplateId) {
			const next = capacityForTemplate(
				mseCatalog.templates.find((row) => row.id === bounded.mseTemplateId),
				mseCatalog.templates
			);
			for (const field of ['oracleText', 'flavorText'] as const) {
				const current = editor.activeFace[field];
				if (current.length > next.total) editor.updateFace(field, current.slice(0, next.total));
			}
		}
	}

	const canvasProps = {
		layoutId: editor.draft.layoutId,
		rarity: editor.draft.rarity,
		finish: editor.draft.finish,
		setCode: editor.draft.setCode,
		collectorNumber: editor.draft.collectorNumber,
		labels,
	};

	return (
		<main className={styles.page}>
			<EditorSidebar
				draft={editor.draft}
				face={editor.activeFace}
				activePanel={activePanel}
				validationErrors={validationErrors}
				rulesCapacity={rulesCapacity}
				mseTemplates={mseCatalog.templates}
				isMseCatalogLoading={mseCatalog.isLoading}
				hasMseCatalogError={mseCatalog.error}
				onPanelChange={setActivePanel}
				onFieldChange={handleFieldChange}
				onArtworkChange={handleArtworkChange}
				onFaceAppearanceChange={editor.updateFaceAppearance}
				onDraftChange={handleDraftChange}
			/>

			{/* La barre d'outils et le bandeau vivent dans la colonne de droite :
			    la sidebar doit toucher le haut de la page, donc plus rien ne peut
			    s'étendre au-dessus d'elle. */}
			<section
				className={styles.previewColumn}
				aria-label={t('preview.title')}
				onDragOver={(event) => event.preventDefault()}
				onDrop={handlePreviewDrop}
			>
				<EditorToolbar
					hasBackFace={Boolean(editor.draft.faces[1])}
					activeFace={editor.draft.activeFace}
					canUndo={editor.canUndo}
					canRedo={editor.canRedo}
					isSaving={isSaving}
					isAuthLoading={isAuthLoading}
					autosaveStatus={editor.autosaveStatus}
					onFaceChange={editor.setActiveFace}
					onAddBackFace={editor.addBackFace}
					onRemoveBackFace={editor.removeBackFace}
					onUndo={editor.undo}
					onRedo={editor.redo}
					onReset={handleReset}
					onExport={() => void handleExport()}
					onSave={() => void handleSave()}
				/>

				{notice && (
					<div
						className={styles.notice}
						data-type={notice.type}
						role={notice.type === 'error' ? 'alert' : 'status'}
					>
						<NoticeIcon type={notice.type} />
						<span>{notice.message}</span>
						{notice.type === 'info' && !user && (
							<Link href="/auth/login">{t('notices.loginAction')}</Link>
						)}
					</div>
				)}

				<div className={styles.previewStage}>
					<div className={styles.stageGlow} aria-hidden />
					<CardCanvas
						ref={activeSvg}
						{...canvasProps}
						face={editor.activeFace}
						mseFramePath={resolveMseFramePath(selectedMseTemplate, editor.activeFace)}
						mseCrownPath={resolveMseCrownPath(
							selectedMseTemplate,
							editor.activeFace,
							isLegendary(editor.activeFace)
						)}
						mseTextColors={resolveMseTextColors(selectedMseTemplate, editor.activeFace)}
						mseTemplate={selectedMseTemplate}
						onFieldChange={handleFieldChange}
						onArtworkChange={handleArtworkChange}
					/>
				</div>
			</section>

			<div className={styles.hiddenRenders} aria-hidden="true">
				<CardCanvas
					ref={frontSvg}
					{...canvasProps}
					face={editor.draft.faces[0]}
					mseFramePath={resolveMseFramePath(selectedMseTemplate, editor.draft.faces[0])}
					mseCrownPath={resolveMseCrownPath(
						selectedMseTemplate,
						editor.draft.faces[0],
						isLegendary(editor.draft.faces[0])
					)}
					mseTextColors={resolveMseTextColors(selectedMseTemplate, editor.draft.faces[0])}
					mseTemplate={selectedMseTemplate}
					onFieldChange={() => undefined}
					onArtworkChange={() => undefined}
					isInteractive={false}
				/>
				{editor.draft.faces[1] && (
					<CardCanvas
						ref={backSvg}
						{...canvasProps}
						face={editor.draft.faces[1]}
						mseFramePath={resolveMseFramePath(selectedMseTemplate, editor.draft.faces[1])}
						mseCrownPath={resolveMseCrownPath(
							selectedMseTemplate,
							editor.draft.faces[1],
							isLegendary(editor.draft.faces[1])
						)}
						mseTextColors={resolveMseTextColors(selectedMseTemplate, editor.draft.faces[1])}
						mseTemplate={selectedMseTemplate}
						onFieldChange={() => undefined}
						onArtworkChange={() => undefined}
						isInteractive={false}
					/>
				)}
			</div>
		</main>
	);
}
