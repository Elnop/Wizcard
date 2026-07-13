'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import type { ScryfallRuling } from '@/lib/scryfall/types/scryfall';
import { getCardRulings } from '@/lib/scryfall/endpoints/cards';
import { scryfallGet } from '@/lib/scryfall/utils/fetcher';
import type { ScryfallCardSearchResult } from '@/lib/scryfall/types/scryfall';
import styles from './RulingsTab.module.css';

interface Props {
	cardId: string;
	oracleId?: string;
}

async function resolveRulings(
	cardId: string,
	oracleId: string | undefined,
	signal: AbortSignal
): Promise<ScryfallRuling[]> {
	const isMpcId = cardId.startsWith('mpc:');
	if (!isMpcId) {
		return getCardRulings(cardId, signal);
	}
	if (!oracleId) return [];
	const result = await scryfallGet<ScryfallCardSearchResult>(
		'/cards/search',
		{ q: `oracle_id:${oracleId}`, unique: 'cards', order: 'released' },
		signal
	);
	const first = result.data[0];
	if (!first) return [];
	return getCardRulings(first.id, signal);
}

export function RulingsTab({ cardId, oracleId }: Props) {
	const t = useTranslations('card');
	const [rulings, setRulings] = useState<ScryfallRuling[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const controller = new AbortController();

		const fetchRulings = async () => {
			try {
				setLoading(true);
				const data = await resolveRulings(cardId, oracleId, controller.signal);
				if (!controller.signal.aborted) {
					setRulings(data);
				}
			} catch {
				if (!controller.signal.aborted) {
					setRulings([]);
				}
			} finally {
				if (!controller.signal.aborted) {
					setLoading(false);
				}
			}
		};

		fetchRulings();

		return () => {
			controller.abort();
		};
	}, [cardId, oracleId]);

	if (loading) {
		return <div className={styles.loading}>{t('loadingRulings')}</div>;
	}

	if (rulings.length === 0) {
		return <div className={styles.empty}>{t('noRulings')}</div>;
	}

	return (
		<div className={styles.container}>
			{rulings.map((ruling, i) => (
				<div key={i} className={styles.ruling}>
					<div className={styles.date}>{ruling.published_at}</div>
					<div className={styles.comment}>{ruling.comment}</div>
				</div>
			))}
		</div>
	);
}
