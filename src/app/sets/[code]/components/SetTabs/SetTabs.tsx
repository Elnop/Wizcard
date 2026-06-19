'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import type { SetGroup } from '@/lib/scryfall/utils/set-classification';
import { SetCardsGrid } from '../SetCardsGrid/SetCardsGrid';
import styles from './SetTabs.module.css';

export interface SetTabsProps {
	group: SetGroup;
}

export function SetTabs({ group }: SetTabsProps) {
	const searchParams = useSearchParams();
	const router = useRouter();
	const pathname = usePathname();

	const tabs = group.sets;
	const validIds = new Set(tabs.map((s) => s.code));
	const rawTab = searchParams.get('tab');
	const activeId = rawTab && validIds.has(rawTab) ? rawTab : tabs[0].code;

	function setTab(code: string) {
		const params = new URLSearchParams(searchParams.toString());
		if (code === tabs[0].code) {
			params.delete('tab');
		} else {
			params.set('tab', code);
		}
		const qs = params.toString();
		router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
	}

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
						onClick={() => setTab(set.code)}
					>
						<span className={styles.tabName}>{set.name}</span>
						<span className={styles.tabCode}>{set.code.toUpperCase()}</span>
					</button>
				))}
			</div>

			<SetCardsGrid key={activeId} setCode={activeId} />
		</div>
	);
}
