'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { CardList } from '@/lib/card/components/CardList/CardList';
import { Spinner } from '@/components/Spinner/Spinner';
import { useEdhrecRecommendations } from '@/lib/edhrec/useEdhrecRecommendations';
import type { AnyCard, CardListSection } from '@/lib/card/components/CardList/CardList.types';
import type { ReactNode } from 'react';
import styles from './CardSearchPanel.module.css';

type Props = {
	commanderName: string | null;
	onCardClick: (card: AnyCard) => void;
	renderOverlay: (card: AnyCard) => ReactNode;
};

export function EdhrecRecommendations({ commanderName, onCardClick, renderOverlay }: Props) {
	const t = useTranslations('decks');
	const { sections, isLoading, error } = useEdhrecRecommendations(commanderName);

	const listSections = useMemo<CardListSection[]>(
		() =>
			sections
				// Drop sections that resolved to zero cards; keep pending ones as loaders.
				.filter((s) => s.status === 'pending' || s.cards.length > 0)
				.map((s) => ({
					label: s.header,
					cards: s.cards,
					loading: s.status === 'pending',
				})),
		[sections]
	);

	// Initial fetch of the section structure (fast).
	if (isLoading) {
		return (
			<div className={styles.results}>
				<div className={styles.edhrecCenter}>
					<Spinner />
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className={styles.results}>
				<p className={styles.noResults}>{t('noEdhrecForCommander')}</p>
			</div>
		);
	}

	if (listSections.length === 0) {
		return (
			<div className={styles.results}>
				<p className={styles.noResults}>{t('noEdhrecFound')}</p>
			</div>
		);
	}

	return (
		<div className={styles.results}>
			<CardList
				cards={listSections}
				onCardClick={onCardClick}
				renderOverlay={renderOverlay}
				viewModes={['grid']}
				pageSize={false}
				fluidSections
			/>
		</div>
	);
}
