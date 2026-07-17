'use client';

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { Card } from '@/types/cards';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import { useCardPrints } from '@/lib/scryfall/hooks/useCardPrints';
import { useCustomCardPrints } from '@/lib/mpc/hooks/useCustomCardPrints';
import { isCustomCard } from '@/lib/mpc/types';
import type { CustomCard } from '@/lib/mpc/types';
import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import { CardList } from '@/lib/card/components/CardList/CardList';
import { CardLightbox } from '@/lib/card/components/CardLightbox/CardLightbox';
import type { PrintListProps } from './PrintList.types';
import { buildPrintSections } from './buildPrintSections';
import styles from './PrintList.module.css';

export function PrintList({
	prints_search_uri,
	currentCardId,
	currentSet,
	currentCollectorNumber,
	currentLang,
	oracleId,
	onSelect,
}: PrintListProps) {
	const t = useTranslations('card');
	const { prints, loading, error } = useCardPrints(prints_search_uri);
	const { prints: customPrints, loading: customLoading } = useCustomCardPrints(oracleId);
	const { profile } = useProfileContext();
	const preferredLang = profile?.language;
	const [lightboxCard, setLightboxCard] = useState<Card | ScryfallCard | null>(null);

	function isCurrentPrint(card: ScryfallCard): boolean {
		if (card.id === currentCardId) return true;
		// set/number/lang matching only applies to official prints — a custom
		// card can share a set_code with an official print without being it.
		if (isCustomCard(card as ScryfallCard | CustomCard)) return false;
		if (currentSet && currentCollectorNumber && currentLang) {
			return (
				card.set === currentSet &&
				card.collector_number === currentCollectorNumber &&
				(card.lang ?? 'en') === currentLang
			);
		}
		return false;
	}

	const { sections, fullyEmpty } = useMemo(
		() =>
			buildPrintSections({
				prints,
				officialLoading: loading,
				officialError: error,
				customPrints,
				currentLang: currentLang ?? 'en',
				preferredLang,
				label: { officialPrints: t('officialPrints'), customCards: t('customCards') },
			}),
		[prints, loading, error, currentLang, preferredLang, customPrints, t]
	);

	function renderOverlay(anyCard: AnyCard): ReactNode {
		const print = anyCard as ScryfallCard;
		const isCurrent = isCurrentPrint(print);
		return (
			<button
				type="button"
				className={`${styles.selectBtn} ${isCurrent ? styles.selectBtnActive : ''}`}
				onClick={(e) => {
					e.stopPropagation();
					onSelect(print);
				}}
			>
				{isCurrent ? 'Selected' : 'Select'}
			</button>
		);
	}

	const tableColumns = [
		{
			key: 'set',
			label: t('colPrint'),
			render: (anyCard: AnyCard) => {
				const card = anyCard as ScryfallCard;
				return (
					<>
						<div className={styles.setName}>{card.set_name}</div>
						<div className={styles.setMeta}>#{card.collector_number}</div>
					</>
				);
			},
		},
		{
			key: 'rarity',
			label: t('rarity'),
			render: (anyCard: AnyCard) => {
				const rarity = (anyCard as ScryfallCard).rarity ?? '';
				return rarity.charAt(0).toUpperCase() + rarity.slice(1);
			},
		},
		{
			key: 'action',
			label: '',
			render: (anyCard: AnyCard) => renderOverlay(anyCard),
		},
	];

	// Only block the whole picker while there is genuinely nothing to show yet.
	// Once custom prints are ready they render immediately, even while the official
	// Scryfall fetch is still paginating (basic lands return thousands of prints).
	if (fullyEmpty && (loading || customLoading)) {
		return <p className={styles.status}>{t('loadingPrints')}</p>;
	}
	if (fullyEmpty && error) return <p className={styles.statusError}>{error}</p>;
	if (fullyEmpty) return <p className={styles.status}>{t('noPrintFound')}</p>;

	return (
		<>
			<CardList
				cards={sections}
				pageSize={false}
				viewModes={['grid', 'fluid-grid', 'table']}
				renderOverlay={renderOverlay}
				onCardClick={(card) => setLightboxCard(card as Card | ScryfallCard)}
				tableColumns={tableColumns}
			/>
			{lightboxCard && (
				<CardLightbox card={lightboxCard as ScryfallCard} onClose={() => setLightboxCard(null)} />
			)}
		</>
	);
}
