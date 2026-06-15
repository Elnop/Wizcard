'use client';

import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { CardList } from '@/lib/card/components/CardList/CardList';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import styles from './CardTokensSection.module.css';

interface CardTokensSectionProps {
	tokens: ScryfallCard[];
	loading: boolean;
	onTokenClick: (card: ScryfallCard) => void;
}

/**
 * List of token thumbnails produced by a card. Clicking a token invokes
 * `onTokenClick` (the caller opens its detail modal). Renders nothing once
 * loading is done and no token resolved.
 */
export function CardTokensSection({ tokens, loading, onTokenClick }: CardTokensSectionProps) {
	if (loading) {
		return <p className={styles.loading}>Chargement des tokens…</p>;
	}

	if (tokens.length === 0) return null;

	return (
		<CardList
			cards={tokens}
			onCardClick={(card: AnyCard) => onTokenClick(card as ScryfallCard)}
			viewModes={['fluid-grid', 'grid', 'table']}
			cardGap="compact"
			showCardNames={false}
			pageSize={false}
		/>
	);
}
