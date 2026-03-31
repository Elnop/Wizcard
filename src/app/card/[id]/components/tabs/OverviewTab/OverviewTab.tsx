'use client';

import type { ScryfallCard, ScryfallColor } from '@/lib/scryfall/types/scryfall';
import { useScryfallSymbols } from '@/lib/scryfall/hooks/useScryfallSymbols';
import { SymbolText } from '@/components/SymbolText';
import styles from './OverviewTab.module.css';

const colorNames: Record<ScryfallColor, string> = {
	W: 'White',
	U: 'Blue',
	B: 'Black',
	R: 'Red',
	G: 'Green',
};

function splitOracleText(text: string | undefined): string[] {
	if (!text) return [];
	return text.split('\n').filter(Boolean);
}

interface Props {
	card: ScryfallCard;
}

export function OverviewTab({ card }: Props) {
	const symbolMap = useScryfallSymbols();
	const colors = card.colors ?? card.color_identity ?? [];
	const oracleLines = splitOracleText(card.oracle_text);

	return (
		<div className={styles.container}>
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
	);
}
