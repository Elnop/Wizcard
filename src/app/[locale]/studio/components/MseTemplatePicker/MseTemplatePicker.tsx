'use client';

import { Check, MagnifyingGlass, Stack } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
	buildFrameChoices,
	findActiveChoice,
	groupFrameChoices,
	type FrameChoice,
} from '@/lib/card-editor/frame-choices';
import { cardAssetUrl, type MseTemplate } from '@/lib/card-editor/mse-assets';
import type { CardLayoutId } from '@/lib/card-editor/types';
import styles from './MseTemplatePicker.module.css';

const PAGE_SIZE = 30;

interface MseTemplatePickerProps {
	templates: MseTemplate[];
	/** Gabarits maison proposés, dans l'ordre d'affichage. */
	houseLayoutIds: readonly CardLayoutId[];
	layoutId: CardLayoutId;
	mseTemplateId: string;
	isLoading: boolean;
	hasError: boolean;
	onSelect: (choice: FrameChoice) => void;
}

/**
 * Sous-titre de la vignette : source + type vendor, ou mention du gabarit
 * maison. Extrait en fonction pour éviter un ternaire imbriqué dans un
 * template literal imbriqué (règles sonarjs) sans changer le rendu.
 */
function subtitleFor(choice: FrameChoice, t: ReturnType<typeof useTranslations>): string {
	if (!choice.template) return t('houseFrame');
	const sourceLabel = choice.template.source === 'cardconjurer' ? 'CardConjurer' : 'MSE';
	const kindLabel = t(`kinds.${choice.template.kind}`);
	return `${sourceLabel} · ${kindLabel}`;
}

export function MseTemplatePicker({
	templates,
	houseLayoutIds,
	layoutId,
	mseTemplateId,
	isLoading,
	hasError,
	onSelect,
}: MseTemplatePickerProps) {
	const t = useTranslations('cardEditor.mseLibrary');
	const layouts = useTranslations('cardEditor.layouts');
	const [query, setQuery] = useState('');
	const [limit, setLimit] = useState(PAGE_SIZE);

	const renderableTemplates = useMemo(
		() => templates.filter((template) => template.renderMode === 'frame'),
		[templates]
	);
	const choices = useMemo(
		() => buildFrameChoices(renderableTemplates, houseLayoutIds),
		[houseLayoutIds, renderableTemplates]
	);

	// Le libellé maison est traduit ici (le modèle ne connaît pas l'i18n) : on le
	// résout AVANT de filtrer, pour que la recherche porte sur ce qui est affiché.
	// `choice.label` vaut ici toujours un `CardLayoutId` (cf. buildFrameChoices),
	// mais `FrameChoice.label` est typé `string` : le cast reflète cette invariance
	// sans l'élargir dans l'interface partagée.
	const labelled = useMemo(
		() =>
			choices.map((choice) =>
				choice.kind === 'house'
					? { ...choice, label: layouts(`${choice.label as CardLayoutId}.name`) }
					: choice
			),
		[choices, layouts]
	);

	const filtered = useMemo(() => {
		const needle = query.trim().toLocaleLowerCase();
		if (!needle) return labelled;
		return labelled.filter((choice) => choice.label.toLocaleLowerCase().includes(needle));
	}, [labelled, query]);

	const active = findActiveChoice(labelled, layoutId, mseTemplateId);
	const sections = useMemo(() => groupFrameChoices(filtered.slice(0, limit)), [filtered, limit]);

	if (isLoading) {
		return (
			<div className={styles.loading} role="status">
				<Stack size={22} />
				<span>{t('loading')}</span>
			</div>
		);
	}

	if (hasError) {
		return <p className={styles.error}>{t('error')}</p>;
	}

	return (
		<div className={styles.library}>
			<div className={styles.libraryHeader}>
				<div>
					<strong>{t('title')}</strong>
					<span>{t('count', { count: labelled.length })}</span>
				</div>
			</div>
			<label className={styles.search}>
				<MagnifyingGlass size={17} aria-hidden />
				<span className={styles.srOnly}>{t('searchLabel')}</span>
				<input
					type="search"
					value={query}
					placeholder={t('searchPlaceholder')}
					onChange={(event) => {
						setQuery(event.target.value);
						setLimit(PAGE_SIZE);
					}}
				/>
			</label>
			<div className={styles.resultLine} aria-live="polite">
				{t('results', { count: filtered.length })}
			</div>
			{sections.length > 0 ? (
				sections.map((section) => (
					<section key={section.kind} className={styles.section}>
						<h4 className={styles.sectionTitle}>
							{t(`sections.${section.kind}`)}
							<span className={styles.sectionCount}>{section.choices.length}</span>
						</h4>
						<div className={styles.grid}>
							{section.choices.map((choice) => {
								const isSelected = active?.key === choice.key;
								return (
									<button
										key={choice.key}
										type="button"
										className={isSelected ? styles.templateSelected : styles.template}
										data-template-id={choice.mseTemplateId}
										aria-pressed={isSelected}
										onClick={() => onSelect(choice)}
									>
										<span className={styles.preview}>
											{choice.template?.samplePath ? (
												// eslint-disable-next-line @next/next/no-img-element -- dynamic local vendor catalogue
												<img
													src={cardAssetUrl(choice.template.samplePath) ?? undefined}
													alt=""
													loading="lazy"
													decoding="async"
												/>
											) : (
												<Stack size={24} />
											)}
											{isSelected && (
												<span className={styles.check}>
													<Check size={14} weight="bold" />
												</span>
											)}
										</span>
										<span className={styles.templateCopy}>
											<strong title={choice.label}>{choice.label}</strong>
											<small>{subtitleFor(choice, t)}</small>
										</span>
									</button>
								);
							})}
						</div>
					</section>
				))
			) : (
				<p className={styles.empty}>{t('empty')}</p>
			)}
			{limit < filtered.length && (
				<button
					type="button"
					className={styles.loadMore}
					onClick={() => setLimit(limit + PAGE_SIZE)}
				>
					{t('loadMore', { count: Math.min(PAGE_SIZE, filtered.length - limit) })}
				</button>
			)}
		</div>
	);
}
