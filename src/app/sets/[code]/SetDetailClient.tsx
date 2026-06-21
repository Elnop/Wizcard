'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Spinner } from '@/components/Spinner/Spinner';
import { useScryfallSets } from '@/lib/scryfall/hooks/useScryfallSets';
import { groupSets, type SetGroup } from '@/lib/scryfall/utils/set-classification';
import { SetDetailHeader } from './components/SetDetailHeader/SetDetailHeader';
import { SetTabs } from './components/SetTabs/SetTabs';
import { useActiveSetTab } from './components/SetTabs/useActiveSetTab';
import { useSetCompletion } from './components/SetCollectionView/useSetCompletion';
import styles from './page.module.css';

export interface SetDetailClientProps {
	code: string;
}

export function SetDetailClient({ code }: SetDetailClientProps) {
	const { sets, isLoading, error } = useScryfallSets();
	const target = code.toLowerCase();

	const group = useMemo<SetGroup | null>(() => {
		if (sets.length === 0) return null;
		// Famille reconstruite par parent_set_code : on retrouve le groupe dont la
		// racine correspond au code demandé.
		const byRoot = groupSets(sets).find((g) => g.key === target);
		if (byRoot) return byRoot;
		// Fallback : code d'un set dérivé (ou orphelin) saisi directement → groupe à un set.
		const single = sets.find((s) => s.code === target);
		if (single) return { key: single.code, title: single.name, sets: [single], latest: 0 };
		return null;
	}, [sets, target]);

	if (isLoading) {
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
			<SetDetailContent group={group} />
		</main>
	);
}

/**
 * Rendered only once the set group is resolved, so the completion/active-tab hooks
 * run unconditionally. Completion is fetched for the active tab and shared between
 * the header rings and the grid.
 */
function SetDetailContent({ group }: { group: SetGroup }) {
	const { activeId, setTab } = useActiveSetTab(group);
	const {
		cards: allCards,
		completion,
		isLoading: isCompletionLoading,
		isPartialCollection,
	} = useSetCompletion(activeId);

	return (
		<>
			<SetDetailHeader
				group={group}
				activeCode={activeId}
				completion={completion}
				isCompletionLoading={isCompletionLoading}
				isPartialCollection={isPartialCollection}
			/>
			<SetTabs
				group={group}
				activeId={activeId}
				onTabChange={setTab}
				completion={completion}
				allCards={allCards}
				isCompletionLoading={isCompletionLoading}
			/>
		</>
	);
}
