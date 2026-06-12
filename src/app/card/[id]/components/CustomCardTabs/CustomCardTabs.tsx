'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import type { CustomCard } from '@/lib/mpc/types';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { OverviewTab } from '../tabs/OverviewTab/OverviewTab';
import { CustomPrintsTab } from '../tabs/CustomPrintsTab/CustomPrintsTab';
import styles from './CustomCardTabs.module.css';

type TabId = 'overview' | 'prints';

const TABS: { id: TabId; label: string }[] = [
	{ id: 'overview', label: 'Overview' },
	{ id: 'prints', label: 'Prints custom' },
];

interface Props {
	card: CustomCard;
}

export function CustomCardTabs({ card }: Props) {
	const searchParams = useSearchParams();
	const router = useRouter();
	const pathname = usePathname();

	const rawTab = searchParams.get('tab');
	const activeTab: TabId = rawTab === 'prints' ? 'prints' : 'overview';

	function setTab(tab: TabId) {
		const params = new URLSearchParams(searchParams.toString());
		if (tab === 'overview') {
			params.delete('tab');
		} else {
			params.set('tab', tab);
		}
		router.push(`${pathname}?${params.toString()}`, { scroll: false });
	}

	const isEnriched = Boolean(card.oracle_text || card.type_line || card.colors);
	const hasLegalities = 'legalities' in card && card.legalities != null;
	const showOverview = isEnriched && hasLegalities;

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

			{activeTab === 'overview' && showOverview && (
				<OverviewTab card={card as unknown as ScryfallCard} />
			)}
			{activeTab === 'overview' && !showOverview && (
				<p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', padding: '24px 0' }}>
					Cette carte n&apos;est pas enrichie avec les données Scryfall.
				</p>
			)}
			{activeTab === 'prints' && <CustomPrintsTab card={card} />}
		</div>
	);
}
