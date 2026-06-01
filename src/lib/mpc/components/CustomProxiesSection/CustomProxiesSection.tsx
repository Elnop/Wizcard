'use client';

import { useEffect, useState } from 'react';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { Spinner } from '@/components/Spinner/Spinner';
import { getCustomCardSources, getCustomCards } from '@/lib/supabase/custom-cards';
import { toSyntheticScryfallCard } from '../../adapter';
import type { MpcCard, MpcSource } from '../../types';
import styles from './CustomProxiesSection.module.css';

export function CustomProxiesSection() {
	const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
	const [sources, setSources] = useState<MpcSource[]>([]);
	const [sourcesLoading, setSourcesLoading] = useState(false);
	const [sourcesError, setSourcesError] = useState<string | null>(null);
	const [cards, setCards] = useState<MpcCard[]>([]);
	const [cardsLoading, setCardsLoading] = useState(false);
	const [cardsError, setCardsError] = useState<string | null>(null);

	const { addCard } = useCollectionContext();

	const activeSourceId = selectedSourceId ?? sources[0]?.id ?? null;
	const activeSource = sources.find((s) => s.id === activeSourceId);

	useEffect(() => {
		const load = async () => {
			setSourcesLoading(true);
			setSourcesError(null);
			try {
				const data = await getCustomCardSources();
				setSources(data);
			} catch (err: unknown) {
				setSourcesError(err instanceof Error ? err.message : 'Unknown error');
			} finally {
				setSourcesLoading(false);
			}
		};
		void load();
	}, []);

	useEffect(() => {
		if (!activeSourceId) return;
		let cancelled = false;
		const load = async () => {
			setCardsLoading(true);
			setCardsError(null);
			setCards([]);
			try {
				const data = await getCustomCards(activeSourceId);
				if (!cancelled) setCards(data);
			} catch (err: unknown) {
				if (!cancelled) setCardsError(err instanceof Error ? err.message : 'Unknown error');
			} finally {
				if (!cancelled) setCardsLoading(false);
			}
		};
		void load();
		return () => {
			cancelled = true;
		};
	}, [activeSourceId]);

	return (
		<div className={styles.section}>
			<div className={styles.header}>
				<div className={styles.titleRow}>
					<span className={styles.title}>Custom Proxies</span>
					<span className={styles.badge}>MPC</span>
				</div>
			</div>

			{sourcesLoading && (
				<div className={styles.loading}>
					<Spinner size="md" />
					<p>Loading sources…</p>
				</div>
			)}

			{sourcesError && !sourcesLoading && (
				<div className={styles.error}>
					<p>Failed to load sources: {sourcesError}</p>
				</div>
			)}

			{!sourcesLoading && !sourcesError && sources.length > 0 && (
				<div className={styles.sourceTabs}>
					{sources.map((source) => (
						<button
							key={source.id}
							type="button"
							className={`${styles.sourceTab} ${source.id === activeSourceId ? styles.sourceTabActive : ''}`}
							onClick={() => setSelectedSourceId(source.id)}
						>
							{source.name}
							{!source.isBuiltIn && <span className={styles.userBadge}>custom</span>}
						</button>
					))}
				</div>
			)}

			{cardsLoading && (
				<div className={styles.loading}>
					<Spinner size="md" />
				</div>
			)}

			{cardsError && !cardsLoading && (
				<div className={styles.error}>
					<p>Failed to load cards: {cardsError}</p>
				</div>
			)}

			{!cardsLoading && !cardsError && cards.length > 0 && activeSource && (
				<div className={styles.grid}>
					{cards.map((card) => {
						const synthetic = toSyntheticScryfallCard(card, activeSource);
						return (
							<div key={card.id} className={styles.card}>
								{/* eslint-disable-next-line @next/next/no-img-element */}
								<img
									src={card.imageUrl}
									alt={card.name}
									className={styles.cardImage}
									loading="lazy"
								/>
								<div className={styles.cardOverlay}>
									<span className={styles.cardName}>{card.name}</span>
									<button
										type="button"
										className={styles.addButton}
										onClick={() =>
											addCard(synthetic, {
												proxy: true,
												tags: ['custom:mpc', `mpc-source:${card.sourceId}`],
											})
										}
									>
										+ Add
									</button>
								</div>
							</div>
						);
					})}
				</div>
			)}

			{!cardsLoading &&
				!cardsError &&
				!sourcesError &&
				cards.length === 0 &&
				activeSourceId &&
				!sourcesLoading && (
					<div className={styles.empty}>
						<p>No cards found in this source.</p>
					</div>
				)}
		</div>
	);
}
