'use client';

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { Card } from '@/types/cards';
import type { AnyCard, CardListSection } from '@/lib/card/components/CardList/CardList.types';
import { useCardPrints } from '@/lib/scryfall/hooks/useCardPrints';
import { useCustomCardPrints } from '@/lib/mpc/hooks/useCustomCardPrints';
import { isCustomCard } from '@/lib/mpc/types';
import type { CustomCard } from '@/lib/mpc/types';
import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import { CardList } from '@/lib/card/components/CardList/CardList';
import { CardLightbox } from '@/lib/card/components/CardLightbox/CardLightbox';
import { type PrintListProps, groupPrintsByLang } from './PrintList.types';
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
	const { prints: customPrints, loading: customLoading } = useCustomCardPrints(
		oracleId,
		currentCardId
	);
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

	const sections: CardListSection[] = useMemo(() => {
		if (loading || error) return [];
		const hasCustom = customPrints.length > 0;

		let officialSections: CardListSection[] = [];
		if (prints.length > 0) {
			const byLang = groupPrintsByLang(prints, currentLang ?? 'en', preferredLang);
			if (byLang.length > 0) {
				officialSections = hasCustom
					? [{ label: t('officialPrints'), cards: [], children: byLang }]
					: byLang;
			}
		}

		const customSection: CardListSection | null = hasCustom
			? { label: t('customCards'), cards: customPrints as unknown as AnyCard[] }
			: null;

		return [...officialSections, ...(customSection ? [customSection] : [])];
	}, [prints, loading, error, currentLang, preferredLang, customPrints, t]);

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

	if (loading || customLoading) return <p className={styles.status}>{t('loadingPrints')}</p>;
	if (error) return <p className={styles.statusError}>{error}</p>;
	if (sections.length === 0) return <p className={styles.status}>{t('noPrintFound')}</p>;

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
