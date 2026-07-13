'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { CustomCard } from '@/lib/mpc/types';
import { isCustomCard } from '@/lib/mpc/types';
import { useScryfallSymbols } from '@/lib/scryfall/hooks/useScryfallSymbols';
import { SymbolText } from '@/lib/scryfall/components/SymbolText';
import { CardImage } from '@/lib/card/components/CardImage/CardImage';
import { CardLightbox } from '@/lib/card/components/CardLightbox/CardLightbox';
import { AddToCollectionButton } from '../AddToCollectionButton/AddToCollectionButton';
import styles from './CardPageHeader.module.css';

const rarityLabels: Record<string, string> = {
	common: 'Common',
	uncommon: 'Uncommon',
	rare: 'Rare',
	mythic: 'Mythic Rare',
	special: 'Special',
	bonus: 'Bonus',
};

interface Props {
	card: ScryfallCard | CustomCard;
}

export function CardPageHeader({ card }: Props) {
	const t = useTranslations('card');
	const symbolMap = useScryfallSymbols();
	const [lightbox, setLightbox] = useState(false);
	const custom = isCustomCard(card) ? card.custom : null;

	const cardNameSlug = card.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
	const edhrecUrl = `https://edhrec.com/cards/${cardNameSlug}`;

	return (
		<>
			<div className={styles.container}>
				{/* Card name + mana cost. Lives here (a direct grid/flex child, not
				    inside infoSection) so that on mobile CSS `order` can lift it
				    above the image while keeping the image centered below. */}
				<header className={styles.header}>
					<h1 className={styles.name}>{card.name}</h1>
					{card.mana_cost && (
						<span className={styles.manaCost}>
							<SymbolText text={card.mana_cost} symbolMap={symbolMap} />
						</span>
					)}
				</header>

				<div className={styles.imageSection}>
					<CardImage card={card} size="normal" priority onClick={() => setLightbox(true)} />
				</div>

				<div className={styles.infoSection}>
					{card.type_line && <div className={styles.typeLine}>{card.type_line}</div>}

					{custom ? (
						<div className={styles.setInfo}>
							{custom.set_code && <span>{custom.set_code.toUpperCase()}</span>}
							{custom.set_code && custom.collector_number && <span>·</span>}
							{custom.collector_number && <span>#{custom.collector_number}</span>}
							{(custom.set_code || custom.collector_number) && <span>·</span>}
							<span className={styles.badge}>{t('custom')}</span>
						</div>
					) : (
						<div className={styles.setInfo}>
							<span>{(card as ScryfallCard).set_name}</span>
							<span>·</span>
							<span className={styles.rarity}>
								{rarityLabels[(card as ScryfallCard).rarity] ?? (card as ScryfallCard).rarity}
							</span>
							<span>·</span>
							<span>#{(card as ScryfallCard).collector_number}</span>
						</div>
					)}

					{!custom && <AddToCollectionButton card={card as ScryfallCard} />}

					<div className={styles.externalLinks}>
						{custom ? (
							<>
								{card.oracle_id && (
									<a
										href={`https://scryfall.com/search?q=oracle_id%3A${card.oracle_id}`}
										target="_blank"
										rel="noopener noreferrer"
										className={styles.externalLink}
									>
										Scryfall
									</a>
								)}
								{card.oracle_id && (
									<a
										href={edhrecUrl}
										target="_blank"
										rel="noopener noreferrer"
										className={styles.externalLink}
									>
										EDHREC
									</a>
								)}
								{custom.source_name && (
									<span className={styles.sourceInfo}>
										{custom.source_drive_folder_id ? (
											<a
												href={`https://drive.google.com/drive/folders/${custom.source_drive_folder_id}`}
												target="_blank"
												rel="noopener noreferrer"
												className={styles.externalLink}
											>
												{custom.source_name}
											</a>
										) : (
											<span className={styles.sourceName}>{custom.source_name}</span>
										)}
									</span>
								)}
							</>
						) : (
							<>
								<a
									href={(card as ScryfallCard).scryfall_uri}
									target="_blank"
									rel="noopener noreferrer"
									className={styles.externalLink}
								>
									Scryfall
								</a>
								<a
									href={edhrecUrl}
									target="_blank"
									rel="noopener noreferrer"
									className={styles.externalLink}
								>
									EDHREC
								</a>
								<a
									href={`https://www.moxfield.com/cards/${(card as ScryfallCard).id}`}
									target="_blank"
									rel="noopener noreferrer"
									className={styles.externalLink}
								>
									Moxfield
								</a>
							</>
						)}
					</div>
				</div>
			</div>

			{lightbox && <CardLightbox card={card as ScryfallCard} onClose={() => setLightbox(false)} />}
		</>
	);
}
