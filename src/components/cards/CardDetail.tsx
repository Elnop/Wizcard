'use client';

import type { ScryfallCard, ScryfallColor } from '@/lib/scryfall/types/scryfall';
import { useSymbols } from '@/hooks/useSymbols';
import { SymbolText } from '@/components/ui/SymbolText';
import { CardImage } from './CardImage';
import styles from './CardDetail.module.css';

export interface CardDetailProps {
	card: ScryfallCard;
}

const colorNames: Record<ScryfallColor, string> = {
	W: 'White',
	U: 'Blue',
	B: 'Black',
	R: 'Red',
	G: 'Green',
};

const rarityLabels: Record<string, string> = {
	common: 'Common',
	uncommon: 'Uncommon',
	rare: 'Rare',
	mythic: 'Mythic Rare',
	special: 'Special',
	bonus: 'Bonus',
};

function splitOracleText(text: string | undefined): string[] {
	if (!text) return [];
	return text.split('\n').filter(Boolean);
}

export function CardDetail({ card }: CardDetailProps) {
	const symbolMap = useSymbols();
	const colors = card.colors ?? card.color_identity ?? [];
	const oracleLines = splitOracleText(card.oracle_text);

	return (
		<div className={styles.container}>
			<div className={styles.imageSection}>
				<CardImage card={card} size="large" priority />
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

				{oracleLines.length > 0 && (
					<div className={styles.oracleText}>
						{oracleLines.map((line, index) => (
							<p key={index}>
								<SymbolText text={line} symbolMap={symbolMap} />
							</p>
						))}
					</div>
				)}

				{card.flavor_text && (
					<div className={styles.flavorText}>
						<em>{card.flavor_text}</em>
					</div>
				)}

				{(card.power || card.toughness) && (
					<div className={styles.stats}>
						<span className={styles.statLabel}>P/T:</span>
						<span className={styles.statValue}>
							{card.power}/{card.toughness}
						</span>
					</div>
				)}

				{card.loyalty && (
					<div className={styles.stats}>
						<span className={styles.statLabel}>Loyalty:</span>
						<span className={styles.statValue}>{card.loyalty}</span>
					</div>
				)}

				<div className={styles.metadata}>
					<div className={styles.metaRow}>
						<span className={styles.metaLabel}>Set</span>
						<span className={styles.metaValue}>{card.set_name}</span>
					</div>

					<div className={styles.metaRow}>
						<span className={styles.metaLabel}>Rarity</span>
						<span className={styles.metaValue}>{rarityLabels[card.rarity] ?? card.rarity}</span>
					</div>

					<div className={styles.metaRow}>
						<span className={styles.metaLabel}>Collector #</span>
						<span className={styles.metaValue}>{card.collector_number}</span>
					</div>

					{card.artist && (
						<div className={styles.metaRow}>
							<span className={styles.metaLabel}>Artist</span>
							<span className={styles.metaValue}>{card.artist}</span>
						</div>
					)}

					{colors.length > 0 && (
						<div className={styles.metaRow}>
							<span className={styles.metaLabel}>Colors</span>
							<div className={styles.colorPills}>
								{colors.map((color) => (
									<span key={color} className={styles.colorPill} data-color={color}>
										{colorNames[color]}
									</span>
								))}
							</div>
						</div>
					)}
				</div>

				{card.prices && (
					<div className={styles.prices}>
						<h3 className={styles.pricesTitle}>Prices</h3>
						<div className={styles.priceGrid}>
							{card.prices.usd && (
								<div className={styles.priceItem}>
									<span className={styles.priceLabel}>USD</span>
									<span className={styles.priceValue}>${card.prices.usd}</span>
								</div>
							)}
							{card.prices.usd_foil && (
								<div className={styles.priceItem}>
									<span className={styles.priceLabel}>USD Foil</span>
									<span className={styles.priceValue}>${card.prices.usd_foil}</span>
								</div>
							)}
							{card.prices.eur && (
								<div className={styles.priceItem}>
									<span className={styles.priceLabel}>EUR</span>
									<span className={styles.priceValue}>{card.prices.eur}€</span>
								</div>
							)}
						</div>
					</div>
				)}

				<div className={styles.legalities}>
					<h3 className={styles.legalitiesTitle}>Legalities</h3>
					<div className={styles.legalityGrid}>
						{Object.entries(card.legalities).map(([format, legality]) => (
							<div key={format} className={styles.legalityItem} data-legality={legality}>
								<span className={styles.formatName}>{format}</span>
								<span className={styles.legalityStatus}>{legality.replace('_', ' ')}</span>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
