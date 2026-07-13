'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ScryfallColor, ScryfallSet } from '@/lib/scryfall/types/scryfall';
import { useScryfallSymbols } from '@/lib/scryfall/hooks/useScryfallSymbols';
import { SearchBar } from '@/lib/search/components/SearchBar/SearchBar';
import { ColorFilter } from '@/lib/search/components/filters/ColorFilter/ColorFilter';
import { ColorIdentityFilter } from '@/lib/search/components/filters/ColorIdentityFilter/ColorIdentityFilter';
import { RarityFilter } from '@/lib/search/components/filters/RarityFilter/RarityFilter';
import { TypeFilter } from '@/lib/search/components/filters/TypeFilter/TypeFilter';
import { OracleTextFilter } from '@/lib/search/components/filters/OracleTextFilter/OracleTextFilter';
import { CmcFilter } from '@/lib/search/components/filters/CmcFilter/CmcFilter';
import { SetFilter } from '@/lib/search/components/filters/SetFilter/SetFilter';
import { SortFilter } from '@/lib/search/components/filters/SortFilter/SortFilter';
import type { CollectionFilters } from '@/lib/card/utils/filterCollectionCards';
import { defaultCollectionFilters } from '@/lib/card/utils/filterCollectionCards';
import { MTG_LANGUAGES } from '@/lib/mtg/languages';
import styles from './CollectionFiltersAside.module.css';

export interface CollectionFiltersAsideProps {
	filters: CollectionFilters;
	onChange: (filters: CollectionFilters) => void;
	sets: ScryfallSet[];
	setsLoading: boolean;
	activeFilterCount: number;
}

export function CollectionFiltersAside({
	filters,
	onChange,
	sets,
	setsLoading,
	activeFilterCount,
}: CollectionFiltersAsideProps) {
	const t = useTranslations('collection');
	const symbolMap = useScryfallSymbols();
	const [mobileOpen, setMobileOpen] = useState(false);
	const extraSortOptions = [{ value: 'language', label: t('sortLanguage') }];

	function patch<K extends keyof CollectionFilters>(key: K, value: CollectionFilters[K]) {
		onChange({ ...filters, [key]: value });
	}

	function handleReset() {
		onChange(defaultCollectionFilters);
	}

	const isFiltered = activeFilterCount > 0;

	return (
		<>
			<button
				type="button"
				className={styles.mobileToggle}
				onClick={() => setMobileOpen((v) => !v)}
				aria-expanded={mobileOpen}
			>
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<path
						d="M2 4h12M4 8h8M6 12h4"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
					/>
				</svg>
				{t('filters')}
				{isFiltered && <span className={styles.badge}>{activeFilterCount}</span>}
			</button>

			{mobileOpen && (
				<div className={styles.overlay} onClick={() => setMobileOpen(false)} aria-hidden="true" />
			)}

			<aside className={`${styles.aside} ${mobileOpen ? styles.mobileVisible : ''}`}>
				<div className={styles.asideHeader}>
					<span className={styles.asideTitle}>
						{t('filters')}
						{isFiltered && <span className={styles.badge}>{activeFilterCount}</span>}
					</span>
					<button
						type="button"
						className={styles.mobileClose}
						onClick={() => setMobileOpen(false)}
						aria-label={t('closeFilters')}
					>
						✕
					</button>
				</div>

				<SearchBar
					value={filters.name}
					onChange={(v) => patch('name', v)}
					placeholder={t('searchByName')}
				/>

				<ColorFilter
					selected={filters.colors}
					onChange={(colors: ScryfallColor[]) => patch('colors', colors)}
					colorMatch={filters.colorMatch}
					onColorMatchChange={(colorMatch) => patch('colorMatch', colorMatch)}
					symbolMap={symbolMap}
				/>

				<ColorIdentityFilter
					selected={filters.colorIdentity}
					onChange={(colorIdentity: ScryfallColor[]) => patch('colorIdentity', colorIdentity)}
					colorIdentityMatch={filters.colorIdentityMatch}
					onColorIdentityMatchChange={(m) => patch('colorIdentityMatch', m)}
					symbolMap={symbolMap}
				/>

				<RarityFilter value={filters.rarities} onChange={(v) => patch('rarities', v)} />

				<TypeFilter value={filters.type} onChange={(v) => patch('type', v)} />

				<OracleTextFilter value={filters.oracleText} onChange={(v) => patch('oracleText', v)} />

				<CmcFilter value={filters.cmc} onChange={(v) => patch('cmc', v)} />

				<SetFilter
					value={filters.set}
					onChange={(v) => patch('set', v)}
					sets={sets}
					isLoading={setsLoading}
				/>

				<div>
					<label htmlFor="collection-proxy-filter" className={styles.filterLabel}>
						{t('finish')}
					</label>
					<select
						id="collection-proxy-filter"
						className={styles.filterSelect}
						value={filters.proxyFilter}
						onChange={(e) =>
							patch('proxyFilter', e.target.value as CollectionFilters['proxyFilter'])
						}
					>
						<option value="all">{t('finishAll')}</option>
						<option value="official">{t('finishOfficialOnly')}</option>
						<option value="proxy">{t('finishProxyOnly')}</option>
					</select>
				</div>

				<div>
					<label htmlFor="collection-foil-filter" className={styles.filterLabel}>
						{t('foil')}
					</label>
					<select
						id="collection-foil-filter"
						className={styles.filterSelect}
						value={filters.foilTypeFilter}
						onChange={(e) =>
							patch('foilTypeFilter', e.target.value as CollectionFilters['foilTypeFilter'])
						}
					>
						<option value="all">{t('foilAll')}</option>
						<option value="none">{t('foilNone')}</option>
						<option value="foil">{t('foilFoil')}</option>
						<option value="etched">{t('foilEtched')}</option>
					</select>
				</div>

				<div>
					<label htmlFor="collection-language-filter" className={styles.filterLabel}>
						{t('language')}
					</label>
					<select
						id="collection-language-filter"
						className={styles.filterSelect}
						value={filters.languageFilter}
						onChange={(e) =>
							patch('languageFilter', e.target.value as CollectionFilters['languageFilter'])
						}
					>
						<option value="all">{t('languageAll')}</option>
						{MTG_LANGUAGES.map((lang) => (
							<option key={lang} value={lang}>
								{lang}
							</option>
						))}
					</select>
				</div>

				<div>
					<label htmlFor="collection-deck-filter" className={styles.filterLabel}>
						{t('deck')}
					</label>
					<select
						id="collection-deck-filter"
						className={styles.filterSelect}
						value={filters.deckAssignment}
						onChange={(e) =>
							patch('deckAssignment', e.target.value as CollectionFilters['deckAssignment'])
						}
					>
						<option value="all">{t('deckAll')}</option>
						<option value="assigned">{t('deckAssigned')}</option>
						<option value="unassigned">{t('deckUnassigned')}</option>
					</select>
				</div>

				<SortFilter
					order={filters.order}
					onOrderChange={(v) => patch('order', v as CollectionFilters['order'])}
					dir={filters.dir}
					onDirChange={(v) => patch('dir', v)}
					allowAuto={false}
					extraOptions={extraSortOptions}
				/>

				{isFiltered && (
					<button type="button" className={styles.resetButton} onClick={handleReset}>
						{t('resetFilters')}
					</button>
				)}
			</aside>
		</>
	);
}
