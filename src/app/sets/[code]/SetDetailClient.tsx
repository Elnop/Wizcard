'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import type { ScryfallSortOrder, ScryfallSortDir } from '@/lib/scryfall/types/sort';
import { Spinner } from '@/components/Spinner/Spinner';
import { useScryfallSets } from '@/lib/scryfall/hooks/useScryfallSets';
import { groupSets, type SetGroup } from '@/lib/scryfall/utils/set-classification';
import { SetDetailHeader } from './components/SetDetailHeader/SetDetailHeader';
import { SetTabs } from './components/SetTabs/SetTabs';
import { useActiveSetTab } from './components/SetTabs/useActiveSetTab';
import { useGroupCompletion } from './components/SetCollectionView/useGroupCompletion';
import { SetFiltersAside } from './components/SetFiltersAside/SetFiltersAside';
import { useSetFiltersStore } from './components/SetFiltersAside/useSetFiltersStore';
import { filterSetCards, countActiveSetFilters } from './components/SetFiltersAside/setFilters';
import styles from './page.module.css';

export interface SetDetailClientProps {
	code: string;
}

export function SetDetailClient({ code }: SetDetailClientProps) {
	const { sets, isLoading, error } = useScryfallSets();
	const target = code.toLowerCase();

	const group = useMemo<SetGroup | null>(() => {
		if (sets.length === 0) return null;
		const groups = groupSets(sets);
		// Le code de l'URL peut être la racine OU n'importe quel set dérivé de la
		// famille (ex. /sets/pspm ouvre le groupe SPM avec PSPM comme onglet actif).
		// On retrouve le groupe dont un des sets porte ce code.
		const byMember = groups.find((g) => g.sets.some((s) => s.code === target));
		if (byMember) return byMember;
		// Fallback : code inconnu de la liste groupée mais set existant (orphelin).
		const single = sets.find((s) => s.code === target);
		if (single) return { key: single.code, title: single.name, sets: [single], latest: 0 };
		return null;
	}, [sets, target]);

	// `sets` starts empty before the fetch effect runs (and isLoading is still
	// false at that point), so treat "no sets yet, no error" as loading too —
	// otherwise the "introuvable" screen flashes on a cold load.
	if (isLoading || (sets.length === 0 && !error)) {
		return (
			<main className={styles.main}>
				<div className={styles.loading}>
					<Spinner size="lg" />
				</div>
			</main>
		);
	}

	if (error || !group) {
		return (
			<main className={styles.main}>
				<div className={styles.notFound}>
					<h1>Extension introuvable</h1>
					<p>Aucune extension ne correspond au code « {code.toUpperCase()} ».</p>
					<Link href="/sets" className={styles.back}>
						← Retour aux extensions
					</Link>
				</div>
			</main>
		);
	}

	return (
		<main className={styles.main}>
			<SetDetailContent group={group} urlCode={target} />
		</main>
	);
}

/**
 * Rendered only once the set group is resolved, so the completion/active-tab hooks
 * run unconditionally. Completion is fetched for the active tab and shared between
 * the header rings and the grid.
 */
function SetDetailContent({ group, urlCode }: { group: SetGroup; urlCode: string }) {
	const { activeId, setTab } = useActiveSetTab(group, urlCode);
	const {
		activeCards,
		groupCompletion,
		activeCompletion,
		isLoading: isCompletionLoading,
		isPartialCollection,
	} = useGroupCompletion(group, activeId);

	// Filters live in a store (not useState) so switching tab — which navigates to
	// /sets/<code> and remounts this page — doesn't reset them.
	const filters = useSetFiltersStore((s) => s.filters);
	const setFilters = useSetFiltersStore((s) => s.setFilters);
	const filteredCards = useMemo(
		() => filterSetCards(activeCards, filters, activeCompletion),
		[activeCards, filters, activeCompletion]
	);
	const activeFilterCount = useMemo(() => countActiveSetFilters(filters), [filters]);

	const handleSortChange = (order: ScryfallSortOrder, dir: ScryfallSortDir) =>
		setFilters({ ...filters, order, dir });

	return (
		<div className={styles.layout}>
			<SetFiltersAside
				filters={filters}
				onChange={setFilters}
				activeFilterCount={activeFilterCount}
			/>

			<div className={styles.content}>
				<SetDetailHeader
					group={group}
					activeCode={activeId}
					groupCompletion={groupCompletion}
					activeCompletion={activeCompletion}
					isPartialCollection={isPartialCollection}
				/>
				<SetTabs
					group={group}
					activeId={activeId}
					onTabChange={setTab}
					completion={activeCompletion}
					cards={filteredCards}
					isCompletionLoading={isCompletionLoading}
					sortOrder={filters.order as ScryfallSortOrder}
					sortDir={filters.dir}
					onSortChange={handleSortChange}
				/>
			</div>
		</div>
	);
}
