'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Card } from '@/types/card';
import { CardImage } from '@/components/cards/CardImage';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import styles from './CollectionGrid.module.css';

const PAGE_SIZE = 48;

export interface CollectionGridProps {
	entries: Card[];
	onDecrement: (cardId: string) => void;
	isLoading?: boolean;
	totalExpected?: number;
}

export function CollectionGrid({
	entries,
	onDecrement,
	isLoading,
	totalExpected,
}: CollectionGridProps) {
	const router = useRouter();
	const [{ visibleCount, trackedLength }, setPagination] = useState({
		visibleCount: PAGE_SIZE,
		trackedLength: entries.length,
	});

	const effectiveVisibleCount = entries.length !== trackedLength ? PAGE_SIZE : visibleCount;

	const visibleEntries = entries.slice(0, effectiveVisibleCount);
	const hasMore = effectiveVisibleCount < entries.length;

	const { sentinelRef } = useInfiniteScroll({
		onLoadMore: () =>
			setPagination((prev) => ({
				trackedLength: entries.length,
				visibleCount: prev.visibleCount + PAGE_SIZE,
			})),
		hasMore,
		isLoading: isLoading ?? false,
	});

	const skeletonCount = isLoading ? Math.max(0, (totalExpected ?? 0) - entries.length) : 0;

	return (
		<div className={styles.grid}>
			{visibleEntries.map((entry) => (
				<div key={entry.id} className={styles.item}>
					<div className={styles.imageWrapper}>
						<CardImage
							card={entry}
							size="normal"
							onClick={() => router.push(`/card/${entry.id}`)}
						/>
						{(entry.quantity ?? 0) > 1 && <span className={styles.badge}>x{entry.quantity}</span>}
						<button
							type="button"
							className={styles.removeButton}
							onClick={(e) => {
								e.stopPropagation();
								onDecrement(entry.id);
							}}
							aria-label={`Remove one ${entry.name}`}
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
					<p className={styles.cardName}>{entry.name}</p>
				</div>
			))}
			<div ref={sentinelRef} />
			{Array.from({ length: skeletonCount }).map((_, i) => (
				<div key={`sk-${i}`} className={styles.item}>
					<div className={styles.skeletonImage} />
					<div className={styles.skeletonName} />
				</div>
			))}
		</div>
	);
}
