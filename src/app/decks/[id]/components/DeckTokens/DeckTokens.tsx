'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { DeckZone } from '@/types/decks';
import { CardList } from '@/lib/card/components/CardList/CardList';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import { Spinner } from '@/components/Spinner/Spinner';
import type { ResolvedDeckCard } from '../../useDeckDetail';
import styles from './DeckTokens.module.css';

const CARD_ROW_HEIGHT = 180;

const ZONE_LABELS: Record<DeckZone, string> = {
	mainboard: 'Mainboard',
	commander: 'Commander',
	sideboard: 'Sideboard',
	maybeboard: 'Maybeboard',
	tokens: 'Tokens',
};

const ZONE_ORDER: DeckZone[] = ['mainboard', 'commander', 'sideboard', 'maybeboard'];
const DEFAULT_SCAN_ZONES: DeckZone[] = ['mainboard', 'commander'];

interface DeckTokensProps {
	tokens: ResolvedDeckCard[];
	scanZones: DeckZone[];
	onAddTokens: (zones: DeckZone[]) => void;
	isAdding: boolean;
	renderOverlay?: (card: AnyCard) => ReactNode;
	onCardClick?: (card: AnyCard) => void;
	onCardContextMenu?: (card: AnyCard, e: React.MouseEvent) => void;
}

export function DeckTokens({
	tokens,
	scanZones,
	onAddTokens,
	isAdding,
	renderOverlay,
	onCardClick,
	onCardContextMenu,
}: DeckTokensProps) {
	const availableZones = ZONE_ORDER.filter((z) => scanZones.includes(z));

	const [selectedZones, setSelectedZones] = useState<Set<DeckZone>>(
		() => new Set(DEFAULT_SCAN_ZONES.filter((z) => scanZones.includes(z)))
	);
	const [menuOpen, setMenuOpen] = useState(false);
	const [hasScanned, setHasScanned] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!menuOpen) return;
		function onClickOutside(e: MouseEvent) {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				setMenuOpen(false);
			}
		}
		document.addEventListener('mousedown', onClickOutside);
		return () => document.removeEventListener('mousedown', onClickOutside);
	}, [menuOpen]);

	const toggleZone = (zone: DeckZone) => {
		setSelectedZones((prev) => {
			const next = new Set(prev);
			if (next.has(zone)) next.delete(zone);
			else next.add(zone);
			return next;
		});
	};

	const handleAdd = () => {
		const zones = availableZones.filter((z) => selectedZones.has(z));
		if (zones.length === 0 || isAdding) return;
		setHasScanned(true);
		onAddTokens(zones);
	};

	return (
		<div className={styles.panel}>
			<div className={styles.header}>
				<h2 className={styles.title}>Tokens ({tokens.length})</h2>
				<div className={styles.addControl} ref={menuRef}>
					<button
						type="button"
						className={styles.addButton}
						onClick={handleAdd}
						disabled={isAdding || selectedZones.size === 0}
					>
						{isAdding ? <Spinner /> : '+'} Autodétecter les tokens
					</button>
					<button
						type="button"
						className={styles.caret}
						onClick={() => setMenuOpen((v) => !v)}
						aria-label="Choisir les zones à scanner"
						aria-expanded={menuOpen}
						disabled={isAdding}
					>
						▾
					</button>
					{menuOpen && (
						<div className={styles.menu}>
							<div className={styles.menuTitle}>Zones à scanner</div>
							{availableZones.map((zone) => (
								<label key={zone} className={styles.menuItem}>
									<input
										type="checkbox"
										checked={selectedZones.has(zone)}
										onChange={() => toggleZone(zone)}
									/>
									{ZONE_LABELS[zone]}
								</label>
							))}
						</div>
					)}
				</div>
			</div>

			{tokens.length === 0 ? (
				<div className={styles.emptyRow} style={{ height: CARD_ROW_HEIGHT }}>
					<span className={styles.emptyText}>
						{hasScanned || isAdding
							? 'Aucun token nécessaire dans ce deck'
							: 'Autodétecter les tokens du deck'}
					</span>
				</div>
			) : (
				<CardList
					cards={tokens}
					renderOverlay={renderOverlay}
					onCardClick={onCardClick}
					onCardContextMenu={onCardContextMenu}
					viewModes={['fluid-grid', 'grid', 'table']}
					cardGap="compact"
					showCardNames={false}
					pageSize={false}
				/>
			)}
		</div>
	);
}
