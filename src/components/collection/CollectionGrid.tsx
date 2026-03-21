'use client';

import { useState } from 'react';
import type { CardStack } from '@/types/cards';
import { CardImage } from '@/components/cards/CardImage';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import styles from './CollectionGrid.module.css';

const PAGE_SIZE = 48;

export interface CollectionGridProps {
	stacks: CardStack[];
	onDecrement: (scryfallId: string) => void;
	onStackClick: (stack: CardStack) => void;
	isLoading?: boolean;
	totalExpected?: number;
}

export function CollectionGrid({
	stacks,
	onDecrement,
	onStackClick,
	isLoading,
	totalExpected,
}: CollectionGridProps) {
	const [{ visibleCount, trackedLength }, setPagination] = useState({
		visibleCount: PAGE_SIZE,
		trackedLength: stacks.length,
	});

	const effectiveVisibleCount = stacks.length !== trackedLength ? PAGE_SIZE : visibleCount;

	const visibleStacks = stacks.slice(0, effectiveVisibleCount);
	const hasMore = effectiveVisibleCount < stacks.length;

	const { sentinelRef } = useInfiniteScroll({
		onLoadMore: () =>
			setPagination((prev) => ({
				trackedLength: stacks.length,
				visibleCount: prev.visibleCount + PAGE_SIZE,
			})),
		hasMore,
		isLoading: isLoading ?? false,
	});

	const skeletonCount = isLoading ? Math.max(0, (totalExpected ?? 0) - stacks.length) : 0;

	return (
		<>
			<div className={styles.grid}>
				{visibleStacks.map((stack) => {
					const representative = stack.cards[0];
					if (!representative) return null;
					const count = stack.cards.length;
					return (
						<div key={stack.name} className={styles.item}>
							<div className={styles.imageWrapper}>
								<CardImage
									card={representative}
									size="normal"
									onClick={() => onStackClick(stack)}
								/>
								{count > 1 && <span className={styles.badge}>x{count}</span>}
								<button
									type="button"
									className={styles.removeButton}
									onClick={(e) => {
										e.stopPropagation();
										onDecrement(representative.id);
									}}
									aria-label={`Remove one ${representative.name}`}
								>
									<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
										<path
											d="M2 4h10M5 4V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1M6 6.5v3M8 6.5v3M3 4l.5 7a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1L11 4"
											stroke="currentColor"
											strokeWidth="1.2"
											strokeLinecap="round"
											strokeLinejoin="round"
										/>
									</svg>
								</button>
							</div>
							<p className={styles.cardName}>{representative.name}</p>
						</div>
					);
				})}
				{Array.from({ length: skeletonCount }).map((_, i) => (
					<div key={`sk-${i}`} className={styles.item}>
						<div className={styles.skeletonImage} />
						<div className={styles.skeletonName} />
					</div>
				))}
			</div>
			<div ref={sentinelRef} />
		</>
	);
}
