'use client';

import { Check, Funnel, MagnifyingGlass, Stack } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
	applyFrameFilters,
	buildFrameChoices,
	DEFAULT_FRAME_FILTERS,
	findActiveChoice,
	groupFrameChoices,
	hasActiveFilters,
	matchesQuery,
	type FrameChoice,
	type FrameFilters,
} from '@/lib/card-editor/frame-choices';
import { countTags, displayableTags, rankTagsByRarity } from '@/lib/card-editor/frame-facets';
import { cardAssetUrl, type MseTemplate } from '@/lib/card-editor/mse-assets';
import { FrameFilterModal } from './FrameFilterModal';
import styles from './MseTemplatePicker.module.css';

/** Taille d'une tranche de scroll infini. */
const PAGE_SIZE = 30;
/** Badges affichés sous une vignette ; le reste passe en title. */
const MAX_BADGES = 3;

interface MseTemplatePickerProps {
	templates: MseTemplate[];
	mseTemplateId: string;
	isLoading: boolean;
	hasError: boolean;
	onSelect: (choice: FrameChoice) => void;
}

export function MseTemplatePicker({
	templates,
	mseTemplateId,
	isLoading,
	hasError,
	onSelect,
}: MseTemplatePickerProps) {
	const t = useTranslations('cardEditor.mseLibrary');
	const [query, setQuery] = useState('');
	const [filters, setFilters] = useState<FrameFilters>(DEFAULT_FRAME_FILTERS);
	const [isFilterOpen, setFilterOpen] = useState(false);
	const [limit, setLimit] = useState(PAGE_SIZE);
	const sentinel = useRef<HTMLDivElement>(null);

	const renderableTemplates = useMemo(
		() => templates.filter((template) => template.renderMode === 'frame'),
		[templates]
	);
	const choices = useMemo(() => buildFrameChoices(renderableTemplates), [renderableTemplates]);
	const tagCounts = useMemo(() => countTags(renderableTemplates), [renderableTemplates]);

	const filtered = useMemo(() => {
		const byFilters = applyFrameFilters(choices, filters);
		return byFilters.filter((choice) => matchesQuery(choice, query));
	}, [choices, filters, query]);

	// Toute nouvelle restriction repart de la première tranche : garder un limit
	// élevé afficherait d'un coup un jeu de résultats entièrement différent.
	// Ajusté PENDANT le rendu (pas dans un effet) : un setState synchrone au
	// corps d'un effet déclenche un rendu en cascade évitable. `useState` (et non
	// `useRef`, dont la lecture/écriture est interdite pendant le rendu) garde la
	// dernière combinaison [query, filters] vue pour détecter le changement.
	const restartKey = `${query}::${JSON.stringify(filters)}`;
	const [previousRestartKey, setPreviousRestartKey] = useState(restartKey);
	if (previousRestartKey !== restartKey) {
		setPreviousRestartKey(restartKey);
		if (limit !== PAGE_SIZE) setLimit(PAGE_SIZE);
	}

	// Scroll infini : une sentinelle observée en fin de liste remplace le bouton
	// « Afficher 30 de plus », qui demandait 3 clics pour atteindre la fin.
	useEffect(() => {
		const node = sentinel.current;
		if (!node) return;
		const observer = new IntersectionObserver((entries) => {
			if (entries.some((entry) => entry.isIntersecting)) {
				setLimit((current) => current + PAGE_SIZE);
			}
		});
		observer.observe(node);
		return () => observer.disconnect();
	}, [filtered.length]);

	const visible = filtered.slice(0, limit);
	const active = findActiveChoice(choices, mseTemplateId);
	// Sections par famille tant qu'aucun filtre n'est actif ; grille plate dès
	// qu'il y en a un — un en-tête unique au-dessus de résultats déjà filtrés
	// n'apporte rien et coûte une hauteur d'écran.
	const isFiltering = hasActiveFilters(filters) || query.trim() !== '';
	const sections = useMemo(
		() => (isFiltering ? null : groupFrameChoices(visible)),
		[isFiltering, visible]
	);

	if (isLoading) {
		return (
			<div className={styles.loading} role="status">
				<Stack size={22} />
				<span>{t('loading')}</span>
			</div>
		);
	}
	if (hasError) return <p className={styles.error}>{t('error')}</p>;

	const renderCard = (choice: FrameChoice) => {
		const isSelected = active?.key === choice.key;
		// Mots-clés les plus RARES d'abord : un mot-clé porté par un seul cadre le
		// caractérise, `planeswalker` porté par 21 beaucoup moins.
		const badges = rankTagsByRarity(displayableTags(choice.template.tags), tagCounts);
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
					{choice.template.samplePath ? (
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
					{choice.template.shortName && <small>{choice.template.shortName}</small>}
					{badges.length > 0 && (
						<span className={styles.badges} title={badges.join(', ')}>
							{badges.slice(0, MAX_BADGES).map((tag) => (
								<span key={tag} className={styles.badge}>
									{tag}
								</span>
							))}
						</span>
					)}
				</span>
			</button>
		);
	};

	return (
		<div className={styles.library}>
			<div className={styles.libraryHeader}>
				<div>
					<strong>{t('title')}</strong>
					<span>{t('count', { count: choices.length })}</span>
				</div>
				<button type="button" className={styles.filterButton} onClick={() => setFilterOpen(true)}>
					<Funnel size={16} />
					{t('filters')}
				</button>
			</div>

			<label className={styles.search}>
				<MagnifyingGlass size={17} aria-hidden />
				<span className={styles.srOnly}>{t('searchLabel')}</span>
				<input
					type="search"
					value={query}
					placeholder={t('searchPlaceholder')}
					onChange={(event) => setQuery(event.target.value)}
				/>
			</label>

			<div className={styles.resultLine} aria-live="polite">
				{t('results', { count: filtered.length })}
			</div>

			{filtered.length === 0 && <p className={styles.empty}>{t('empty')}</p>}

			{sections
				? sections.map((section) => (
						<section key={section.family} className={styles.section}>
							<h4 className={styles.sectionTitle}>
								{section.family}
								<span className={styles.sectionCount}>{section.choices.length}</span>
							</h4>
							<div className={styles.grid}>{section.choices.map(renderCard)}</div>
						</section>
					))
				: visible.length > 0 && <div className={styles.grid}>{visible.map(renderCard)}</div>}

			{limit < filtered.length && <div ref={sentinel} className={styles.sentinel} aria-hidden />}

			{isFilterOpen && (
				<FrameFilterModal
					templates={renderableTemplates}
					initialFilters={filters}
					onApply={setFilters}
					onClose={() => setFilterOpen(false)}
				/>
			)}
		</div>
	);
}
