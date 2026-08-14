'use client';

import { X } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/Modal/Modal';
import {
	countTags,
	displayableTags,
	familyLabelKey,
	frameFamily,
	frameOrigin,
	supportsCreature,
} from '@/lib/card-editor/frame-facets';
import { DEFAULT_FRAME_FILTERS, type FrameFilters } from '@/lib/card-editor/frame-choices';
import type { MseTemplate } from '@/lib/card-editor/mse-assets';
import styles from './FrameFilterModal.module.css';

/** Propositions affichées sous le champ mot-clé. */
const MAX_KEYWORD_SUGGESTIONS = 8;

interface FrameFilterModalProps {
	templates: MseTemplate[];
	initialFilters: FrameFilters;
	onApply: (filters: FrameFilters) => void;
	onClose: () => void;
}

/**
 * Modale de filtres de la bibliothèque de cadres.
 *
 * Cinq champs : quatre `<select>` et un champ de saisie à propositions pour les
 * mots-clés. Ni un `<select>` de 188 options ni un mur de 188 puces ne seraient
 * praticables — on tape, on choisit dans une courte liste, le mot-clé retenu
 * devient une puce retirable.
 *
 * Le champ suit le motif du studio (cf. `TypeLineField`) plutôt que le
 * `TagInput` de `@/lib/mpc` : ce dernier est câblé sur la taxonomie MPC au
 * niveau module et n'affiche pas de compte par entrée.
 *
 * Chaque option de `<select>` porte son COMPTE et les options à zéro résultat
 * sont masquées : c'est ce qui rend 30 familles parcourables sans en cacher
 * aucune.
 */
export function FrameFilterModal({
	templates,
	initialFilters,
	onApply,
	onClose,
}: FrameFilterModalProps) {
	const t = useTranslations('cardEditor.mseLibrary');
	/** Cf. le même helper dans MseTemplatePicker : officielles traduites, autres brutes. */
	const familyLabel = (family: string): string => {
		const key = familyLabelKey(family);
		return key ? t(key) : family;
	};
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

	// Les mots de phrase (« after », « edition »…) restent dans `tags` pour la
	// recherche mais ne caractérisent aucun cadre : displayableTags() les exclut
	// des propositions, sans toucher aux comptes.
	const displayableTagSet = useMemo(
		() => new Set(displayableTags([...tagCounts.keys()])),
		[tagCounts]
	);

	/**
	 * Propositions du champ mot-clé.
	 *
	 * Vides tant que rien n'est saisi : dérouler 188 entrées à l'ouverture
	 * remplacerait le mur de puces qu'on retire. Le tri reste le nombre de cadres
	 * décroissant — `planeswalker` (21) avant `nyx` (1) — et aucun mot-clé
	 * caractérisant n'est écarté : les plus rares sont souvent les plus
	 * discriminants quand on sait ce qu'on cherche.
	 */
	const suggestions = useMemo(() => {
		const needle = keywordQuery.trim().toLocaleLowerCase();
		if (!needle) return [];
		return [...tagCounts.entries()]
			.filter(
				([tag]) => displayableTagSet.has(tag) && tag.includes(needle) && !draft.tags.includes(tag)
			)
			.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
			.slice(0, MAX_KEYWORD_SUGGESTIONS);
	}, [keywordQuery, tagCounts, displayableTagSet, draft.tags]);

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

	/** Retient un mot-clé et vide la saisie, pour enchaîner sur le suivant. */
	function addTag(tag: string) {
		setDraft((current) =>
			current.tags.includes(tag) ? current : { ...current, tags: [...current.tags, tag] }
		);
		setKeywordQuery('');
	}

	return (
		<Modal onClose={onClose} className={styles.panel}>
			<div className={styles.header}>
				<span className={styles.title}>{t('filters')}</span>
				<button
					type="button"
					className={styles.closeButton}
					onClick={onClose}
					aria-label={t('filtersClose')}
				>
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
						{/* Même traduction que les titres de section du sélecteur : la
						    valeur envoyée reste la chaîne du corpus, seul l'affichage change. */}
						{families.map(([family, count]) => (
							<option key={family} value={family}>
								{familyLabel(family)} ({count})
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
					{draft.tags.length > 0 && (
						<div className={styles.keywordList}>
							{draft.tags.map((tag) => (
								<span key={tag} className={styles.keywordActive}>
									{tag}
									<button
										type="button"
										className={styles.keywordRemove}
										onClick={() => toggleTag(tag)}
										aria-label={`${t('filterKeyword')} — ${tag}`}
									>
										<X size={11} weight="bold" />
									</button>
								</span>
							))}
						</div>
					)}
					<div className={styles.keywordInput}>
						<input
							type="text"
							value={keywordQuery}
							placeholder={t('keywordSearch')}
							autoComplete="off"
							onChange={(event) => setKeywordQuery(event.target.value)}
							onKeyDown={(event) => {
								// Entrée retient la première proposition : le cas courant est de
								// taper trois lettres puis valider sans quitter le clavier.
								if (event.key === 'Enter') {
									event.preventDefault();
									const first = suggestions[0];
									if (first) addTag(first[0]);
								}
								// Retour arrière sur un champ vide retire le dernier mot-clé,
								// raccourci attendu de ce type de champ (cf. TypeLineField).
								if (event.key === 'Backspace' && !keywordQuery && draft.tags.length > 0) {
									toggleTag(draft.tags[draft.tags.length - 1]);
								}
							}}
						/>
						{suggestions.length > 0 && (
							<ul className={styles.suggestions}>
								{suggestions.map(([tag, count]) => (
									<li key={tag}>
										{/* onMouseDown et non onClick : le blur de l'input ne doit pas
										    fermer la liste avant que le clic n'aboutisse. */}
										<button type="button" onMouseDown={() => addTag(tag)}>
											{tag} <span className={styles.count}>{count}</span>
										</button>
									</li>
								))}
							</ul>
						)}
					</div>
				</fieldset>
			</div>

			<div className={styles.footer}>
				<button
					type="button"
					className={styles.resetButton}
					onClick={() => setDraft(DEFAULT_FRAME_FILTERS)}
				>
					{t('filtersReset')}
				</button>
				<button
					type="button"
					className={styles.applyButton}
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
