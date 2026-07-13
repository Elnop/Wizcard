'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { CustomCard } from '@/lib/mpc/types';
import { CardTokensSection } from '@/lib/card/components/CardTokensSection/CardTokensSection';
import { CardModal } from '@/lib/card/components/CardModal/CardModal';
import { useCardTokens } from '@/lib/card/hooks/useCardTokens';
import styles from './TokensTab.module.css';

interface Props {
	card: ScryfallCard | CustomCard;
}

export function TokensTab({ card }: Props) {
	const t = useTranslations('card');
	const { tokens, loading } = useCardTokens(card);
	const [tokenModalCard, setTokenModalCard] = useState<ScryfallCard | null>(null);

	return (
		<div className={styles.container}>
			{!loading && tokens.length === 0 ? (
				<p className={styles.empty}>{t('noTokens')}</p>
			) : (
				<CardTokensSection tokens={tokens} loading={loading} onTokenClick={setTokenModalCard} />
			)}

			{tokenModalCard && (
				<CardModal cards={tokenModalCard} onClose={() => setTokenModalCard(null)} />
			)}
		</div>
	);
}
