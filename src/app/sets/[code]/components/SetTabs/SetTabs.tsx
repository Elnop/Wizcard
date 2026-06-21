'use client';

import type { SetGroup } from '@/lib/scryfall/utils/set-classification';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { ScryfallSortOrder, ScryfallSortDir } from '@/lib/scryfall/types/sort';
import type { SetCompletion } from '../../utils/setCompletion';
import { SetCardsGrid } from '../SetCardsGrid/SetCardsGrid';
import styles from './SetTabs.module.css';

export interface SetTabsProps {
	group: SetGroup;
	activeId: string;
	onTabChange: (code: string) => void;
	completion: SetCompletion;
	/** Cards to render (already filtered/sorted at the page level). */
	cards: ScryfallCard[];
	isCompletionLoading: boolean;
	sortOrder: ScryfallSortOrder;
	sortDir: ScryfallSortDir;
	onSortChange: (order: ScryfallSortOrder, dir: ScryfallSortDir) => void;
}

export function SetTabs({
	group,
	activeId,
	onTabChange,
	completion,
	cards,
	isCompletionLoading,
	sortOrder,
	sortDir,
	onSortChange,
}: SetTabsProps) {
	const tabs = group.sets;

	return (
		<div className={styles.wrapper}>
			<div className={styles.tabList} role="tablist">
				{tabs.map((set) => (
					<button
						key={set.code}
						role="tab"
						type="button"
						className={styles.tab}
						data-active={activeId === set.code}
						aria-selected={activeId === set.code}
						onClick={() => onTabChange(set.code)}
					>
						<span className={styles.tabName}>{set.name}</span>
						<span className={styles.tabCode}>{set.code.toUpperCase()}</span>
					</button>
				))}
			</div>

			<SetCardsGrid
				key={activeId}
				completion={completion}
				cards={cards}
				isLoading={isCompletionLoading}
				sortOrder={sortOrder}
				sortDir={sortDir}
				onSortChange={onSortChange}
			/>
		</div>
	);
}
