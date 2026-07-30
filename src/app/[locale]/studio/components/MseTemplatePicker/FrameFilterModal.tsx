'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/Modal/Modal';
import {
	countTags,
	displayableTags,
	frameFamily,
	frameOrigin,
	supportsCreature,
} from '@/lib/card-editor/frame-facets';
import { DEFAULT_FRAME_FILTERS, type FrameFilters } from '@/lib/card-editor/frame-choices';
import type { MseTemplate } from '@/lib/card-editor/mse-assets';
import styles from './FrameFilterModal.module.css';

interface FrameFilterModalProps {
	templates: MseTemplate[];
	initialFilters: FrameFilters;
	onApply: (filters: FrameFilters) => void;
	onClose: () => void;
}

/**
 * Modale de filtres de la bibliothèque de cadres.
 *
 * Cinq champs : quatre `<select>` et une liste filtrable pour les mots-clés —
 * un `<select>` de 188 options serait aussi impraticable que la liste qu'on
 * corrige.
 *
 * Chaque option porte son COMPTE, et les options à zéro résultat sont masquées :
 * c'est ce qui rend 30 familles et 188 mots-clés parcourables sans en cacher
 * aucun.
 */
export function FrameFilterModal({
	templates,
	initialFilters,
	onApply,
	onClose,
}: FrameFilterModalProps) {
	const t = useTranslations('cardEditor.mseLibrary');
	const [draft, setDraft] = useState<FrameFilters>(initialFilters);
	const [keywordQuery, setKeywordQuery] = useState('');

	const families = useMemo(() => {
		const counts = new Map<string, number>();
		for (const template of templates) {
			const family = frameFamily(template);
			counts.set(family, (counts.get(family) ?? 0) + 1);
		}
		return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
	}, [templates]);

	const tagCounts = useMemo(() => countTags(templates), [templates]);

	// Tri par nombre de cadres décroissant : `planeswalker` (21) avant `nyx` (1).
	// Aucun mot-clé CARACTÉRISANT n'est retiré — les plus rares sont souvent les
	// plus discriminants quand on sait ce qu'on cherche. Les mots de phrase
	// (« after », « edition »…) restent dans `tags` pour la recherche mais ne
	// caractérisent aucun cadre : displayableTags() les exclut de la liste de
	// puces, sans toucher aux comptes.
	const displayableTagSet = useMemo(
		() => new Set(displayableTags([...tagCounts.keys()])),
		[tagCounts]
	);
	const keywords = useMemo(() => {
		const needle = keywordQuery.trim().toLocaleLowerCase();
		return [...tagCounts.entries()]
			.filter(([tag]) => displayableTagSet.has(tag) && (!needle || tag.startsWith(needle)))
			.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
	}, [keywordQuery, tagCounts, displayableTagSet]);

	const originCounts = useMemo(() => {
		let official = 0;
		for (const template of templates) if (frameOrigin(template) === 'official') official += 1;
		return { official, custom: templates.length - official };
	}, [templates]);

	const creatureCounts = useMemo(() => {
		let yes = 0;
		for (const template of templates) if (supportsCreature(template)) yes += 1;
		return { yes, no: templates.length - yes };
	}, [templates]);

	const orientationCounts = useMemo(() => {
		let portrait = 0;
		for (const template of templates) if (template.orientation !== 'landscape') portrait += 1;
		return { portrait, landscape: templates.length - portrait };
	}, [templates]);

	const toggleTag = (tag: string) =>
		setDraft((current) => ({
			...current,
			tags: current.tags.includes(tag)
				? current.tags.filter((value) => value !== tag)
				: [...current.tags, tag],
		}));

	return (
		<Modal onClose={onClose} className={styles.panel}>
			<div className={styles.header}>
				<span className={styles.title}>{t('filters')}</span>
				<button type="button" className={styles.close} onClick={onClose} aria-label={t('filters')}>
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path
							d="M12 4L4 12M4 4l8 8"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
						/>
					</svg>
				</button>
			</div>

			<div className={styles.body}>
				<label className={styles.field}>
					<span>{t('filterFamily')}</span>
					<select
						value={draft.family ?? ''}
						onChange={(event) =>
							setDraft((current) => ({ ...current, family: event.target.value || null }))
						}
					>
						<option value="">{t('filterAny')}</option>
						{families.map(([family, count]) => (
							<option key={family} value={family}>
								{family} ({count})
							</option>
						))}
					</select>
				</label>

				<label className={styles.field}>
					<span>{t('filterOrigin')}</span>
					<select
						value={draft.origin ?? ''}
						onChange={(event) =>
							setDraft((current) => ({
								...current,
								origin: (event.target.value || null) as FrameFilters['origin'],
							}))
						}
					>
						<option value="">{t('filterAny')}</option>
						<option value="official">
							{t('originOfficial')} ({originCounts.official})
						</option>
						<option value="custom">
							{t('originCustom')} ({originCounts.custom})
						</option>
					</select>
				</label>

				<label className={styles.field}>
					<span>{t('filterOrientation')}</span>
					<select
						value={draft.orientation ?? ''}
						onChange={(event) =>
							setDraft((current) => ({
								...current,
								orientation: (event.target.value || null) as FrameFilters['orientation'],
							}))
						}
					>
						<option value="">{t('filterAny')}</option>
						<option value="portrait">
							{t('orientationPortrait')} ({orientationCounts.portrait})
						</option>
						<option value="landscape">
							{t('orientationLandscape')} ({orientationCounts.landscape})
						</option>
					</select>
				</label>

				<label className={styles.field}>
					<span>{t('filterCreature')}</span>
					<select
						value={draft.creature === null ? '' : String(draft.creature)}
						onChange={(event) =>
							setDraft((current) => ({
								...current,
								creature: event.target.value === '' ? null : event.target.value === 'true',
							}))
						}
					>
						<option value="">{t('filterAny')}</option>
						<option value="true">
							{t('creatureYes')} ({creatureCounts.yes})
						</option>
						<option value="false">
							{t('creatureNo')} ({creatureCounts.no})
						</option>
					</select>
				</label>

				<fieldset className={styles.field}>
					<legend>{t('filterKeyword')}</legend>
					<input
						type="search"
						value={keywordQuery}
						placeholder={t('keywordSearch')}
						onChange={(event) => setKeywordQuery(event.target.value)}
					/>
					<div className={styles.keywordList}>
						{keywords.map(([tag, count]) => (
							<button
								key={tag}
								type="button"
								aria-pressed={draft.tags.includes(tag)}
								className={draft.tags.includes(tag) ? styles.keywordActive : styles.keyword}
								onClick={() => toggleTag(tag)}
							>
								{tag} <span className={styles.count}>{count}</span>
							</button>
						))}
					</div>
				</fieldset>
			</div>

			<div className={styles.footer}>
				<button type="button" onClick={() => setDraft(DEFAULT_FRAME_FILTERS)}>
					{t('filtersReset')}
				</button>
				<button
					type="button"
					className={styles.apply}
					onClick={() => {
						onApply(draft);
						onClose();
					}}
				>
					{t('filtersApply')}
				</button>
			</div>
		</Modal>
	);
}
