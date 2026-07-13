'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ScryfallSet } from '@/lib/scryfall/types/scryfall';
import type { CollectionFilters } from '@/lib/card/utils/filterCollectionCards';
import type { CollectionSortOrder } from '@/lib/card/utils/filterCollectionCards';
import type { ScryfallSortOrder } from '@/lib/scryfall/types/sort';
import { SearchBar } from '@/lib/search/components/SearchBar/SearchBar';
import { FilterModal } from '@/lib/search/components/FilterModal/FilterModal';
import styles from './CollectionFiltersBar.module.css';

interface Props {
	filters: CollectionFilters;
	onChange: (filters: CollectionFilters) => void;
	sets: ScryfallSet[];
	setsLoading?: boolean;
	activeFilterCount: number;
}

/**
 * Compact filter controls: a name search bar plus a "Filters" button that opens
 * the shared FilterModal. Alternative to the sidebar (CollectionFiltersAside) —
 * used when CollectionView is rendered in a narrow context (e.g. profile tabs).
 * Same underlying `filters`/`onChange`, so filtering behaviour is identical.
 */
export function CollectionFiltersBar({
	filters,
	onChange,
	sets,
	setsLoading,
	activeFilterCount,
}: Props) {
	const t = useTranslations('collection');
	const [open, setOpen] = useState(false);

	return (
		<div className={styles.bar}>
			<div className={styles.search}>
				<SearchBar
					value={filters.name}
					onChange={(v) => onChange({ ...filters, name: v })}
					placeholder={t('searchByName')}
				/>
			</div>
			<button
				type="button"
				className={styles.filterButton}
				onClick={() => setOpen(true)}
				aria-label={t('filters')}
			>
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<path
						d="M2 4h12M4 8h8M6 12h4"
						stroke="currentColor"
						strokeWidth="1.6"
						strokeLinecap="round"
					/>
				</svg>
				{t('filters')}
				{activeFilterCount > 0 && <span className={styles.badge}>{activeFilterCount}</span>}
			</button>

			<FilterModal
				isOpen={open}
				variant="default"
				colors={filters.colors}
				colorMatch={filters.colorMatch}
				colorIdentity={filters.colorIdentity}
				colorIdentityMatch={filters.colorIdentityMatch}
				type={filters.type}
				set={filters.set}
				rarities={filters.rarities}
				oracleText={filters.oracleText}
				cmc={filters.cmc}
				order={filters.order as ScryfallSortOrder}
				dir={filters.dir}
				sets={sets}
				setsLoading={setsLoading}
				onClose={() => setOpen(false)}
				onApply={(applied) =>
					onChange({
						...filters,
						colors: applied.colors,
						colorMatch: applied.colorMatch,
						colorIdentity: applied.colorIdentity,
						colorIdentityMatch: applied.colorIdentityMatch,
						type: applied.type,
						set: applied.set,
						rarities: applied.rarities,
						oracleText: applied.oracleText,
						cmc: applied.cmc,
						order: applied.order as CollectionSortOrder,
						dir: applied.dir,
					})
				}
			/>
		</div>
	);
}
