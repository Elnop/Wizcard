'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { CustomCard } from '@/lib/mpc/types';
import { isCustomCard } from '@/lib/mpc/types';
import { OverviewTab } from '../tabs/OverviewTab/OverviewTab';
import { PrintsTab } from '../tabs/PrintsTab/PrintsTab';
import { RulingsTab } from '../tabs/RulingsTab/RulingsTab';
import { SimilarTab } from '../tabs/SimilarTab/SimilarTab';
import { TokensTab } from '../tabs/TokensTab/TokensTab';
import styles from './CardTabs.module.css';

type TabId = 'overview' | 'prints' | 'rulings' | 'similar' | 'tokens';

interface Props {
	card: ScryfallCard | CustomCard;
}

export function CardTabs({ card }: Props) {
	const searchParams = useSearchParams();
	const router = useRouter();
	const pathname = usePathname();
	const custom = isCustomCard(card) ? card : null;

	const isEnriched = Boolean(card.oracle_text || card.type_line || card.colors);
	const hasOracleId = Boolean(card.oracle_id);
	const hasTokenParts = (card.all_parts ?? []).some(
		(p) => p.component === 'token' && p.id !== card.id
	);

	const tabs: { id: TabId; label: string }[] = [
		...(isEnriched ? [{ id: 'overview' as const, label: 'Overview' }] : []),
		...(hasOracleId || !custom ? [{ id: 'prints' as const, label: 'Prints' }] : []),
		...(hasOracleId || !custom ? [{ id: 'rulings' as const, label: 'Rulings' }] : []),
		...(hasOracleId || !custom ? [{ id: 'similar' as const, label: 'Similaires' }] : []),
		...(hasTokenParts ? [{ id: 'tokens' as const, label: 'Tokens' }] : []),
	];

	const validTabIds = new Set(tabs.map((t) => t.id));
	const rawTab = searchParams.get('tab') as TabId | null;
	const activeTab: TabId = rawTab && validTabIds.has(rawTab) ? rawTab : (tabs[0]?.id ?? 'overview');

	function setTab(tab: TabId) {
		const params = new URLSearchParams(searchParams.toString());
		if (tab === tabs[0]?.id) {
			params.delete('tab');
		} else {
			params.set('tab', tab);
		}
		router.push(`${pathname}?${params.toString()}`, { scroll: false });
	}

	if (tabs.length === 0) return null;

	return (
		<div className={styles.wrapper}>
			<div className={styles.tabList} role="tablist">
				{tabs.map(({ id, label }) => (
					<button
						key={id}
						role="tab"
						type="button"
						className={styles.tab}
						data-active={activeTab === id}
						aria-selected={activeTab === id}
						onClick={() => setTab(id)}
					>
						{label}
					</button>
				))}
			</div>

			{activeTab === 'overview' && <OverviewTab card={card as ScryfallCard} />}
			{activeTab === 'prints' && <PrintsTab card={card} />}
			{activeTab === 'rulings' && (
				<RulingsTab cardId={card.id} oracleId={card.oracle_id ?? undefined} />
			)}
			{activeTab === 'similar' && <SimilarTab card={card} />}
			{activeTab === 'tokens' && <TokensTab card={card} />}
		</div>
	);
}
