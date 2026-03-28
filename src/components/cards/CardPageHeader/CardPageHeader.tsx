'use client';

import { useState } from 'react';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { useScryfallSymbols } from '@/lib/scryfall/hooks/useScryfallSymbols';
import { SymbolText } from '@/components/ui/SymbolText/SymbolText';
import { CardImage } from '@/components/cards/CardImage';
import { CardLightbox } from '@/components/cards/CardLightbox';
import { AddToCollectionButton } from '@/lib/collection/components/AddToCollectionButton/AddToCollectionButton';
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
	card: ScryfallCard;
}

export function CardPageHeader({ card }: Props) {
	const symbolMap = useScryfallSymbols();
	const [lightbox, setLightbox] = useState(false);

	const cardNameSlug = card.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
	const edhrecUrl = `https://edhrec.com/cards/${cardNameSlug}`;
	const moxfieldUrl = `https://www.moxfield.com/cards/${card.id}`;

	return (
		<>
			<div className={styles.container}>
				<div className={styles.imageSection}>
					<CardImage card={card} size="normal" priority onClick={() => setLightbox(true)} />
				</div>

				<div className={styles.infoSection}>
					<header className={styles.header}>
						<h1 className={styles.name}>{card.name}</h1>
						{card.mana_cost && (
							<span className={styles.manaCost}>
								<SymbolText text={card.mana_cost} symbolMap={symbolMap} />
							</span>
						)}
					</header>

					<div className={styles.typeLine}>{card.type_line}</div>

					<div className={styles.setInfo}>
						<span>{card.set_name}</span>
						<span>·</span>
						<span className={styles.rarity}>{rarityLabels[card.rarity] ?? card.rarity}</span>
						<span>·</span>
						<span>#{card.collector_number}</span>
					</div>

					<AddToCollectionButton card={card} />

					<div className={styles.externalLinks}>
						<a
							href={card.scryfall_uri}
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
							href={moxfieldUrl}
							target="_blank"
							rel="noopener noreferrer"
							className={styles.externalLink}
						>
							Moxfield
						</a>
					</div>
				</div>
			</div>

			{lightbox && <CardLightbox card={card} onClose={() => setLightbox(false)} />}
		</>
	);
}
