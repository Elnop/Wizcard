'use client';

import { useState } from 'react';
import type { CustomCard } from '@/lib/mpc/types';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { useScryfallSymbols } from '@/lib/scryfall/hooks/useScryfallSymbols';
import { SymbolText } from '@/lib/scryfall/components/SymbolText';
import { CardImage } from '@/lib/card/components/CardImage/CardImage';
import { CardLightbox } from '@/lib/card/components/CardLightbox/CardLightbox';
import styles from './CustomCardPageHeader.module.css';

const CARD_TYPE_LABELS: Record<string, string> = {
	card: 'Card',
	token: 'Token',
	cardback: 'Cardback',
};

interface Props {
	card: CustomCard;
}

export function CustomCardPageHeader({ card }: Props) {
	const symbolMap = useScryfallSymbols();
	const [lightbox, setLightbox] = useState(false);
	const m = card.custom;

	const scryfallSearchUrl = card.oracle_id
		? `https://scryfall.com/search?q=oracle_id%3A${card.oracle_id}`
		: null;

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

					{card.type_line && <div className={styles.typeLine}>{card.type_line}</div>}

					{(m.set_code || m.collector_number) && (
						<div className={styles.setInfo}>
							{m.set_code && <span>{m.set_code.toUpperCase()}</span>}
							{m.set_code && m.collector_number && <span>·</span>}
							{m.collector_number && <span>#{m.collector_number}</span>}
						</div>
					)}

					<div className={styles.badgeRow}>
						<span className={styles.badge}>{CARD_TYPE_LABELS[m.card_type] ?? m.card_type}</span>
						<span className={styles.badgeSecondary}>{m.source_type}</span>
					</div>

					{m.source_name && (
						<div>
							{m.source_type === 'mpc_ingested' && m.source_drive_folder_id ? (
								<a
									className={styles.sourceLink}
									href={`https://drive.google.com/drive/folders/${m.source_drive_folder_id}`}
									target="_blank"
									rel="noopener noreferrer"
								>
									{m.source_name}
								</a>
							) : (
								<span className={styles.sourceLink}>{m.source_name}</span>
							)}
						</div>
					)}

					{scryfallSearchUrl && (
						<div className={styles.externalLinks}>
							<a
								href={scryfallSearchUrl}
								target="_blank"
								rel="noopener noreferrer"
								className={styles.externalLink}
							>
								Scryfall
							</a>
						</div>
					)}
				</div>
			</div>

			{lightbox && (
				<CardLightbox card={card as unknown as ScryfallCard} onClose={() => setLightbox(false)} />
			)}
		</>
	);
}
