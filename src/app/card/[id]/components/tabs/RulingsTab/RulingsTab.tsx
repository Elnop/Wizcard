'use client';

import { useState, useEffect } from 'react';
import type { ScryfallRuling, ScryfallUUID } from '@/lib/scryfall/types/scryfall';
import { getCardRulings } from '@/lib/scryfall/endpoints/cards';
import styles from './RulingsTab.module.css';

interface Props {
	cardId: ScryfallUUID;
}

export function RulingsTab({ cardId }: Props) {
	const [rulings, setRulings] = useState<ScryfallRuling[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const controller = new AbortController();

		const fetchRulings = async () => {
			try {
				setLoading(true);
				const data = await getCardRulings(cardId, controller.signal);
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
	}, [cardId]);

	if (loading) {
		return <div className={styles.loading}>Chargement des rulings…</div>;
	}

	if (rulings.length === 0) {
		return <div className={styles.empty}>Aucun ruling officiel pour cette carte.</div>;
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
