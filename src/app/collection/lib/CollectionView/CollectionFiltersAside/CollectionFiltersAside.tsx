'use client';

import { useState } from 'react';
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

const COLLECTION_EXTRA_SORT_OPTIONS = [{ value: 'language', label: 'Language' }];

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
	const symbolMap = useScryfallSymbols();
	const [mobileOpen, setMobileOpen] = useState(false);

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
				Filters
				{isFiltered && <span className={styles.badge}>{activeFilterCount}</span>}
			</button>

			{mobileOpen && (
				<div className={styles.overlay} onClick={() => setMobileOpen(false)} aria-hidden="true" />
			)}

			<aside className={`${styles.aside} ${mobileOpen ? styles.mobileVisible : ''}`}>
				<div className={styles.asideHeader}>
					<span className={styles.asideTitle}>
						Filters{isFiltered && <span className={styles.badge}>{activeFilterCount}</span>}
					</span>
					<button
						type="button"
						className={styles.mobileClose}
						onClick={() => setMobileOpen(false)}
						aria-label="Close filters"
					>
						✕
					</button>
				</div>

				<SearchBar
					value={filters.name}
					onChange={(v) => patch('name', v)}
					placeholder="Search by name..."
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
						Finish
					</label>
					<select
						id="collection-proxy-filter"
						className={styles.filterSelect}
						value={filters.proxyFilter}
						onChange={(e) =>
							patch('proxyFilter', e.target.value as CollectionFilters['proxyFilter'])
						}
					>
						<option value="all">All</option>
						<option value="official">Official only</option>
						<option value="proxy">Proxy only</option>
					</select>
				</div>

				<div>
					<label htmlFor="collection-foil-filter" className={styles.filterLabel}>
						Foil
					</label>
					<select
						id="collection-foil-filter"
						className={styles.filterSelect}
						value={filters.foilTypeFilter}
						onChange={(e) =>
							patch('foilTypeFilter', e.target.value as CollectionFilters['foilTypeFilter'])
						}
					>
						<option value="all">All</option>
						<option value="none">Non-foil</option>
						<option value="foil">Foil</option>
						<option value="etched">Etched</option>
					</select>
				</div>

				<div>
					<label htmlFor="collection-language-filter" className={styles.filterLabel}>
						Language
					</label>
					<select
						id="collection-language-filter"
						className={styles.filterSelect}
						value={filters.languageFilter}
						onChange={(e) =>
							patch('languageFilter', e.target.value as CollectionFilters['languageFilter'])
						}
					>
						<option value="all">All</option>
						{MTG_LANGUAGES.map((lang) => (
							<option key={lang} value={lang}>
								{lang}
							</option>
						))}
					</select>
				</div>

				<div>
					<label htmlFor="collection-deck-filter" className={styles.filterLabel}>
						Deck
					</label>
					<select
						id="collection-deck-filter"
						className={styles.filterSelect}
						value={filters.deckAssignment}
						onChange={(e) =>
							patch('deckAssignment', e.target.value as CollectionFilters['deckAssignment'])
						}
					>
						<option value="all">All</option>
						<option value="assigned">Assigned to a deck</option>
						<option value="unassigned">Unassigned</option>
					</select>
				</div>

				<SortFilter
					order={filters.order}
					onOrderChange={(v) => patch('order', v as CollectionFilters['order'])}
					dir={filters.dir}
					onDirChange={(v) => patch('dir', v)}
					allowAuto={false}
					extraOptions={COLLECTION_EXTRA_SORT_OPTIONS}
				/>

				{isFiltered && (
					<button type="button" className={styles.resetButton} onClick={handleReset}>
						Reset filters
					</button>
				)}
			</aside>
		</>
	);
}
