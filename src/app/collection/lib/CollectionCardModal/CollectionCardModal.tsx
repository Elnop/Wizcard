'use client';

import { CardModal } from '@/lib/card/components/CardModal/CardModal';
import { useCardModal } from '@/lib/card/hooks/useCardModal';
import { useCollectionCardsContext } from '@/app/collection/context/CollectionCardsContext';

/**
 * Smart wrapper: drives the generic CardModal from the collection's hydrated
 * stacks and the shared open-modal state. The page renders it prop-free; the
 * open state is shared with the grid via ActiveCardContext (consumed inside
 * useCardModal).
 */
export function CollectionCardModal() {
	const { stacks } = useCollectionCardsContext();
	const {
		resolvedStack,
		handleCloseModal,
		handleSaveModal,
		handleRemoveModal,
		handleRemoveEntry,
		handleDuplicateEntry,
		handleIncrementModal,
		handleDecrementModal,
		handleChangePrint,
	} = useCardModal(stacks);

	return (
		<CardModal
			cards={resolvedStack?.cards ?? null}
			onClose={handleCloseModal}
			onSave={handleSaveModal}
			onRemove={handleRemoveModal}
			onRemoveEntry={handleRemoveEntry}
			onDuplicate={handleDuplicateEntry}
			onIncrement={handleIncrementModal}
			onDecrement={handleDecrementModal}
			onChangePrint={handleChangePrint}
		/>
	);
}
