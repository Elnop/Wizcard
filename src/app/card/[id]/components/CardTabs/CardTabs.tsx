'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { OverviewTab } from '../tabs/OverviewTab/OverviewTab';
import { PrintsTab } from '../tabs/PrintsTab/PrintsTab';
import { RulingsTab } from '../tabs/RulingsTab/RulingsTab';
import { SimilarTab } from '../tabs/SimilarTab/SimilarTab';
import styles from './CardTabs.module.css';

type TabId = 'overview' | 'prints' | 'rulings' | 'similar';

const TABS: { id: TabId; label: string }[] = [
	{ id: 'overview', label: 'Overview' },
	{ id: 'prints', label: 'Prints & Prix' },
	{ id: 'rulings', label: 'Rulings' },
	{ id: 'similar', label: 'Similaires' },
];

interface Props {
	card: ScryfallCard;
}

export function CardTabs({ card }: Props) {
	const searchParams = useSearchParams();
	const router = useRouter();
	const pathname = usePathname();

	const rawTab = searchParams.get('tab');
	const activeTab: TabId =
		rawTab === 'prints' || rawTab === 'rulings' || rawTab === 'similar' ? rawTab : 'overview';

	function setTab(tab: TabId) {
		const params = new URLSearchParams(searchParams.toString());
		if (tab === 'overview') {
			params.delete('tab');
		} else {
			params.set('tab', tab);
		}
		router.push(`${pathname}?${params.toString()}`, { scroll: false });
	}

	return (
		<div className={styles.wrapper}>
			<div className={styles.tabList} role="tablist">
				{TABS.map(({ id, label }) => (
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

			{activeTab === 'overview' && <OverviewTab card={card} />}
			{activeTab === 'prints' && <PrintsTab card={card} />}
			{activeTab === 'rulings' && <RulingsTab cardId={card.id} />}
			{activeTab === 'similar' && <SimilarTab card={card} />}
		</div>
	);
}
