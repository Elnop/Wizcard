'use client';

import { useMemo } from 'react';
import type { ScryfallSet } from '@/lib/scryfall/types/scryfall';
import { buildCatalog, type GameTab } from '@/lib/scryfall/utils/set-classification';
import { GameTabs } from '../GameTabs/GameTabs';
import { SetCard } from '../SetCard/SetCard';
import styles from './SetsCatalog.module.css';

export interface SetsCatalogProps {
	sets: ScryfallSet[];
	activeTab: GameTab;
	onTabChange: (tab: GameTab) => void;
	query: string;
	onQueryChange: (query: string) => void;
}

export function SetsCatalog({
	sets,
	activeTab,
	onTabChange,
	query,
	onQueryChange,
}: SetsCatalogProps) {
	const groups = useMemo(() => buildCatalog(sets, activeTab, query), [sets, activeTab, query]);

	return (
		<>
			<div className={styles.toolbar}>
				<input
					type="search"
					className={styles.searchInput}
					placeholder="Rechercher une extension..."
					value={query}
					onChange={(e) => onQueryChange(e.target.value)}
				/>
				<GameTabs active={activeTab} onChange={onTabChange} />
			</div>

			{groups.length === 0 ? (
				<div className={styles.emptyState}>
					<h2>Aucune extension</h2>
					<p>Aucun résultat pour cette recherche ou ce filtre.</p>
				</div>
			) : (
				<div className={styles.grid}>
					{groups.map((group) => (
						<SetCard key={group.key} group={group} />
					))}
				</div>
			)}
		</>
	);
}
