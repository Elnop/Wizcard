'use client';

import { Check, Funnel, MagnifyingGlass, Stack } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
	applyFrameFilters,
	buildFrameChoices,
	DEFAULT_FRAME_FILTERS,
	findActiveChoice,
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
	// La modale de filtres et le calcul de rareté des badges DOIVENT porter sur la
	// même population que la grille (les `choices`), pas sur `renderableTemplates`
	// (206 lignes) : buildFrameChoices en retire encore celles sans géométrie
	// mesurée (-> 109) ET celles portant un mot-clé non pris en charge
	// (planeswalker, flip, recto-verso, leveler, split, tapped, tome : -43, -> 66)
	// ET les cadres communautaires (-26, -> 40). Sans ce filtre partagé, la modale
	// propose des familles et
	// mots-clés dont la grille ne peut jamais rendre un seul résultat — exactement
	// l'impasse que cette refonte doit supprimer.
	const filterableTemplates = useMemo(() => choices.map((choice) => choice.template), [choices]);
	const tagCounts = useMemo(() => countTags(filterableTemplates), [filterableTemplates]);

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
		// Le libellé est passé pour écarter les badges qui ne font que le répéter :
		// le corpus dérive ses `tags` du NOM du gabarit (cf. `displayableTags`).
		const badges = rankTagsByRarity(
			displayableTags(choice.template.tags, `${choice.label} ${choice.template.shortName ?? ''}`),
			tagCounts
		);
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

			{/*
			 * Grille PLATE, sans regroupement par famille.
			 *
			 * Les sections coûtaient une hauteur d'en-tête tous les 1 à 16 cadres
			 * pour une information déjà portée par la vignette et par le filtre
			 * « famille » de la modale. Sur une bibliothèque de 26 entrées, elles
			 * hachaient la grille plus qu'elles ne la rangeaient.
			 *
			 * L'ORDRE, lui, est conservé : `buildFrameChoices` trie déjà par rang de
			 * famille puis `position_hint`, donc les cadres d'une même époque restent
			 * contigus — on retire les titres, pas le classement.
			 */}
			{visible.length > 0 && <div className={styles.grid}>{visible.map(renderCard)}</div>}

			{limit < filtered.length && <div ref={sentinel} className={styles.sentinel} aria-hidden />}

			{isFilterOpen && (
				<FrameFilterModal
					templates={filterableTemplates}
					initialFilters={filters}
					onApply={setFilters}
					onClose={() => setFilterOpen(false)}
				/>
			)}
		</div>
	);
}
