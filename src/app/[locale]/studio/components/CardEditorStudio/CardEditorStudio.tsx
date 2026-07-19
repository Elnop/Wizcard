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
	resolveMseFramePath,
	resolveMseTextColors,
	useMseTemplateCatalog,
	useSelectedMseTemplate,
} from '@/lib/card-editor/mse-assets';
import { validateCardDraft } from '@/lib/card-editor/draft';
import type { CardCanvasLabels, EditableCardField } from '@/lib/card-editor/types';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { useCardEditor } from '../../useCardEditor';
import { EditorSidebar, type EditorPanel } from '../EditorSidebar/EditorSidebar';
import { EditorToolbar } from '../EditorToolbar/EditorToolbar';
import styles from './CardEditorStudio.module.css';

type Notice = { type: 'info' | 'error' | 'success'; message: string } | null;

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
	const [activePanel, setActivePanel] = useState<EditorPanel>('card');
	const [validationErrors, setValidationErrors] = useState<string[]>([]);
	const [notice, setNotice] = useState<Notice>(null);
	const [isSaving, setIsSaving] = useState(false);
	const activeSvg = useRef<SVGSVGElement>(null);
	const frontSvg = useRef<SVGSVGElement>(null);
	const backSvg = useRef<SVGSVGElement>(null);

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
		editor.updateFace(field, value);
	}

	function handleArtworkChange(artwork: Parameters<typeof editor.updateArtwork>[0]) {
		setValidationErrors([]);
		setNotice(null);
		editor.updateArtwork(artwork);
	}

	function handleDraftChange(values: Parameters<typeof editor.updateDraft>[0]) {
		setValidationErrors([]);
		setNotice(null);
		editor.updateDraft(values);
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

			<div className={styles.workspace}>
				<EditorSidebar
					draft={editor.draft}
					face={editor.activeFace}
					activePanel={activePanel}
					validationErrors={validationErrors}
					mseTemplates={mseCatalog.templates}
					isMseCatalogLoading={mseCatalog.isLoading}
					hasMseCatalogError={mseCatalog.error}
					onPanelChange={setActivePanel}
					onFieldChange={handleFieldChange}
					onArtworkChange={handleArtworkChange}
					onFaceAppearanceChange={editor.updateFaceAppearance}
					onDraftChange={handleDraftChange}
				/>

				<section
					className={styles.previewColumn}
					aria-label={t('preview.title')}
					onDragOver={(event) => event.preventDefault()}
					onDrop={handlePreviewDrop}
				>
					<div className={styles.previewHeader}>
						<div>
							<span>{t('preview.eyebrow')}</span>
							<h2>{t('preview.title')}</h2>
						</div>
						<p>{t('preview.hint')}</p>
					</div>
					<div className={styles.previewStage}>
						<div className={styles.stageGlow} aria-hidden />
						<CardCanvas
							ref={activeSvg}
							{...canvasProps}
							face={editor.activeFace}
							mseFramePath={resolveMseFramePath(selectedMseTemplate, editor.activeFace)}
							mseTextColors={resolveMseTextColors(selectedMseTemplate, editor.activeFace)}
							onFieldChange={handleFieldChange}
							onArtworkChange={handleArtworkChange}
						/>
					</div>
					<div className={styles.previewFooter}>
						<span>{t('preview.directEdit')}</span>
						<span>{t('preview.dropImage')}</span>
						<span>{t('preview.highResolution')}</span>
					</div>
				</section>
			</div>

			<div className={styles.hiddenRenders} aria-hidden="true">
				<CardCanvas
					ref={frontSvg}
					{...canvasProps}
					face={editor.draft.faces[0]}
					mseFramePath={resolveMseFramePath(selectedMseTemplate, editor.draft.faces[0])}
					mseTextColors={resolveMseTextColors(selectedMseTemplate, editor.draft.faces[0])}
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
						mseTextColors={resolveMseTextColors(selectedMseTemplate, editor.draft.faces[1])}
						onFieldChange={() => undefined}
						onArtworkChange={() => undefined}
						isInteractive={false}
					/>
				)}
			</div>
		</main>
	);
}
