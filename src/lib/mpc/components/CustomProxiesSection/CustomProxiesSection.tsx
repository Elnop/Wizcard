'use client';

import { useEffect, useState } from 'react';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { Spinner } from '@/components/Spinner/Spinner';
import { useMpcStore } from '../../store/mpc-store';
import { toSyntheticScryfallCard } from '../../adapter';
import type { MpcSource } from '../../types';
import styles from './CustomProxiesSection.module.css';

const ENABLED_KEY = 'mpc-search-enabled';

export function CustomProxiesSection() {
	const [enabled, setEnabled] = useState(() => {
		if (typeof window === 'undefined') return false;
		return localStorage.getItem(ENABLED_KEY) === 'true';
	});
	const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);

	const {
		sources,
		sourcesLoading,
		sourcesError,
		cardsBySource,
		loadingSourceId,
		errorBySource,
		initSources,
		fetchSource,
	} = useMpcStore();
	const { addCard } = useCollectionContext();

	const activeSourceId = selectedSourceId ?? sources[0]?.id ?? null;

	useEffect(() => {
		void initSources();
	}, [initSources]);

	useEffect(() => {
		if (enabled && activeSourceId) {
			void fetchSource(activeSourceId);
		}
	}, [enabled, activeSourceId, fetchSource]);

	function toggle() {
		const next = !enabled;
		setEnabled(next);
		localStorage.setItem(ENABLED_KEY, String(next));
	}

	const activeSource: MpcSource | undefined = sources.find((s) => s.id === activeSourceId);
	const cards = activeSourceId ? (cardsBySource[activeSourceId] ?? []) : [];
	const isLoading = loadingSourceId === activeSourceId;
	const error = activeSourceId ? errorBySource[activeSourceId] : undefined;

	return (
		<div className={styles.section}>
			<div className={styles.header}>
				<div className={styles.titleRow}>
					<span className={styles.title}>Custom Proxies</span>
					<span className={styles.badge}>MPC</span>
				</div>
				<label className={styles.toggle}>
					<input type="checkbox" checked={enabled} onChange={toggle} />
					<span className={styles.toggleTrack}>
						<span className={styles.toggleThumb} />
					</span>
				</label>
			</div>

			{enabled && (
				<>
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
									onClick={() => {
										setSelectedSourceId(source.id);
										void fetchSource(source.id);
									}}
								>
									{source.name}
									{!source.isBuiltIn && <span className={styles.userBadge}>custom</span>}
								</button>
							))}
						</div>
					)}

					{isLoading && (
						<div className={styles.loading}>
							<Spinner size="md" />
						</div>
					)}

					{error && !isLoading && (
						<div className={styles.error}>
							<p>Failed to load cards: {error}</p>
						</div>
					)}

					{!isLoading && !error && cards.length > 0 && activeSource && (
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

					{!isLoading &&
						!error &&
						!sourcesError &&
						cards.length === 0 &&
						activeSourceId &&
						!sourcesLoading && (
							<div className={styles.empty}>
								<p>No cards found in this source.</p>
							</div>
						)}
				</>
			)}
		</div>
	);
}
