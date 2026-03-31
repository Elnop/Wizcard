'use client';

import type { ScryfallSortOrder } from '@/lib/scryfall/types/sort';
import type { CollectionFilters } from '@/app/collection/utils/filterCollectionCards';
import type { ScryfallSet } from '@/lib/scryfall/types/scryfall';
import { FilterModal } from '@/lib/search/components/FilterModal/FilterModal';
import { CardModal } from '@/lib/card/components/CardModal/CardModal';
import type { useImportPreviewState } from './useImportPreviewState';

type ImportPreviewState = ReturnType<typeof useImportPreviewState>;

interface Props {
	state: ImportPreviewState;
	sets: ScryfallSet[];
	setsLoading: boolean;
}

export function ImportSupportModals({ state, sets, setsLoading }: Props) {
	return (
		<>
			<FilterModal
				isOpen={state.isFilterModalOpen}
				colors={state.filters.colors}
				colorMatch={state.filters.colorMatch}
				type={state.filters.type}
				set={state.filters.set}
				rarities={state.filters.rarities}
				oracleText={state.filters.oracleText}
				cmc={state.filters.cmc}
				sets={sets}
				setsLoading={setsLoading}
				order={state.filters.order as ScryfallSortOrder}
				dir={state.filters.dir}
				onApply={(applied) =>
					state.setFilters((prev) => ({ ...prev, ...applied }) as CollectionFilters)
				}
				onClose={() => state.setIsFilterModalOpen(false)}
			/>
			<CardModal
				cards={state.selectedImportStack?.cards ?? null}
				onClose={() => state.setSelectedCardId(null)}
				onSave={state.handleEditSave}
				onRemove={state.handleEditRemove}
				onRemoveEntry={() => {}}
			/>
		</>
	);
}
