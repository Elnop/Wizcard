'use client';

import { useState } from 'react';
import { SearchBar } from '@/lib/search/components/SearchBar/SearchBar';
import { CardList } from '@/lib/card/components/CardList/CardList';
import { useContextMenu } from '@/components/ContextMenu/useContextMenu';
import { SearchCardContextMenu } from './SearchCardContextMenu';
import {
	useScryfallCardSearch,
	type SearchFilters,
} from '@/lib/scryfall/hooks/useScryfallCardSearch';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import type { ScryfallCard, ScryfallColor } from '@/lib/scryfall/types/scryfall';
import type { DeckFormat } from '@/types/decks';
import styles from './CardSearchPanel.module.css';

const FORMATS_WITHOUT_LEGALITY: DeckFormat[] = ['draft', 'limited'];
const COMMANDER_FORMATS: DeckFormat[] = ['commander', 'brawl', 'oathbreaker'];

type Props = {
	deckId: string;
	onCardClick: (card: ScryfallCard) => void;
	onClose: () => void;
	deckFormat?: DeckFormat | null;
	commanderColorIdentity?: ScryfallColor[];
};

export function CardSearchPanel({
	deckId,
	onCardClick,
	onClose,
	deckFormat,
	commanderColorIdentity,
}: Props) {
	const [searchName, setSearchName] = useState('');
	const [legalOnly, setLegalOnly] = useState(true);
	const {
		menu: contextMenu,
		open: openContextMenu,
		close: closeContextMenu,
	} = useContextMenu<ScryfallCard>();

	const showLegalToggle = deckFormat != null && !FORMATS_WITHOUT_LEGALITY.includes(deckFormat);
	const legalFilter = showLegalToggle && legalOnly ? deckFormat : undefined;
	const isCommanderFormat = deckFormat != null && COMMANDER_FORMATS.includes(deckFormat);
	const colorIdentityFilter = legalFilter && isCommanderFormat ? commanderColorIdentity : undefined;

	const filters: SearchFilters = {
		name: searchName,
		colors: [],
		type: '',
		set: '',
		rarities: [],
		oracleText: '',
		cmc: '',
		legal: legalFilter,
		colorIdentity: colorIdentityFilter,
	};

	const { cards, isLoading, isLoadingMore, hasMore, loadMore } = useScryfallCardSearch(filters);

	const renderSearchOverlay = (card: AnyCard) => (
		<div
			className={styles.searchCardOverlay}
			onContextMenu={(e) => openContextMenu(card as ScryfallCard, e)}
		/>
	);

	return (
		<aside className={styles.panel}>
			<div className={styles.header}>
				<span className={styles.title}>Add Cards</span>
				<button
					type="button"
					className={styles.closeBtn}
					onClick={onClose}
					aria-label="Close panel"
				>
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path
							d="M2 2l12 12M14 2L2 14"
							stroke="currentColor"
							strokeWidth="1.8"
							strokeLinecap="round"
						/>
					</svg>
				</button>
			</div>

			<div className={styles.search}>
				<SearchBar value={searchName} onChange={setSearchName} placeholder="Search for a card..." />
				{showLegalToggle && (
					<label className={styles.toggleLabel}>
						<input
							type="checkbox"
							checked={legalOnly}
							onChange={(e) => setLegalOnly(e.target.checked)}
							className={styles.toggleInput}
						/>
						<span className={styles.toggleText}>Legal in {deckFormat} only</span>
					</label>
				)}
			</div>

			<div className={styles.results}>
				<CardList
					cards={cards}
					isLoading={isLoading}
					isLoadingMore={isLoadingMore}
					hasMore={hasMore}
					onLoadMore={loadMore}
					onCardClick={(card: AnyCard) => onCardClick(card as ScryfallCard)}
					renderOverlay={renderSearchOverlay}
					pageSize={false}
					fluidSections
				/>

				{!isLoading && cards.length === 0 && searchName.trim() && (
					<p className={styles.noResults}>No cards found</p>
				)}
			</div>

			{contextMenu && (
				<SearchCardContextMenu
					card={contextMenu.data}
					position={contextMenu.position}
					deckId={deckId}
					format={deckFormat}
					onCardClick={onCardClick}
					onClose={closeContextMenu}
				/>
			)}
		</aside>
	);
}
