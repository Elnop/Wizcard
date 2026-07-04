'use client';

import { useCollectionCards } from '@/lib/collection/hooks/useCollectionCards';
import { useCardModalContext } from '@/contexts/CardModalProvider';
import { CardImage } from '@/lib/card/components/CardImage/CardImage';
import type { CardPreview } from '../useProfileSummary';
import styles from './ProfileCardGrid.module.css';

/**
 * Capped thumbnail grid for a profile section (collection or wishlist preview).
 * Hydrates the preview entries into renderable cards and shows the first print
 * of each stack. Read-only: clicking opens the card modal in read-only mode.
 */
export function ProfileCardGrid({
	preview,
	emptyLabel,
}: {
	preview: CardPreview[];
	emptyLabel: string;
}) {
	const { stacks, isLoading } = useCollectionCards(preview);
	const { openCardModal } = useCardModalContext();

	if (!isLoading && stacks.length === 0) {
		return <p className={styles.empty}>{emptyLabel}</p>;
	}

	return (
		<div className={styles.grid}>
			{stacks.map((stack) => {
				const card = stack.cards[0];
				return (
					<button
						key={stack.oracleId}
						type="button"
						className={styles.cell}
						onClick={() => openCardModal(stack.cards, { readOnly: true })}
					>
						<CardImage card={card} size="small" disableTilt />
					</button>
				);
			})}
		</div>
	);
}
