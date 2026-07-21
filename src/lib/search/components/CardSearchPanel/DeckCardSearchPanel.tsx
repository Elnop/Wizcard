'use client';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { useContextMenu } from '@/components/ContextMenu/useContextMenu';
import { useDeckContext } from '@/lib/deck/context/DeckContext';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useCollectionCards } from '@/lib/collection/hooks/useCollectionCards';
import { SearchCardContextMenu } from './SearchCardContextMenu';
import { PanelTabs, type PanelTab } from './PanelTabs';
import { EdhrecRecommendations } from './EdhrecRecommendations';
import { DeckZoneBadges } from './DeckZoneBadges';
import { useDeckCardIndex } from './useDeckCardIndex';
import { SearchPanelCore, type DeckSteering, type SearchState } from './SearchPanelCore';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import type { ScryfallCard, ScryfallColor } from '@/lib/scryfall/types/scryfall';
import type { DeckFormat } from '@/types/decks';
import styles from './CardSearchPanel.module.css';

const FORMATS_WITHOUT_LEGALITY: DeckFormat[] = ['draft', 'limited'];
const COMMANDER_FORMATS: DeckFormat[] = ['commander', 'brawl', 'oathbreaker'];

export type DeckCardSearchPanelProps = {
	deckId: string;
	onCardClick: (card: ScryfallCard) => void;
	onClose: () => void;
	deckFormat?: DeckFormat | null;
	commanderColorIdentity?: ScryfallColor[];
	commanderName?: string | null;
	onCollectionModeChange?: (inCollectionOnly: boolean) => void;
	expanded: boolean;
	onToggleExpand?: () => void;
};

export function DeckCardSearchPanel({
	deckId,
	onCardClick,
	onClose,
	deckFormat,
	commanderColorIdentity,
	commanderName,
	onCollectionModeChange,
	expanded,
	onToggleExpand,
}: DeckCardSearchPanelProps) {
	const t = useTranslations('decks');
	const [tab, setTab] = useState<PanelTab>('search');
	const [legalOnly, setLegalOnly] = useState(true);
	const [inCollectionOnly, setInCollectionOnly] = useState(false);
	const [isTokenMode, setIsTokenMode] = useState(false);

	const { addCardToDeck } = useDeckContext();
	const { getDeckZones } = useDeckCardIndex(deckId);

	const showLegalToggle = deckFormat != null && !FORMATS_WITHOUT_LEGALITY.includes(deckFormat);
	const isCommanderFormat = deckFormat != null && COMMANDER_FORMATS.includes(deckFormat);
	const showEdhrecTab = isCommanderFormat && !!commanderName;
	const activeTab = showEdhrecTab ? tab : 'search';

	// Collection entries + oracle-id map for the context menu's copy resolution.
	const emptyEntries = useMemo(() => [], []);
	const { entries: collectionEntries } = useCollectionContext();
	const { stacks: collectionStacks } = useCollectionCards(
		inCollectionOnly ? collectionEntries : emptyEntries
	);
	const scryfallIdToOracleId = useMemo(() => {
		const map = new Map<string, string>();
		for (const stack of collectionStacks) {
			for (const card of stack.cards) {
				if (card.oracle_id) map.set(card.id, card.oracle_id);
			}
		}
		return map;
	}, [collectionStacks]);

	const {
		menu: contextMenu,
		open: openContextMenu,
		close: closeContextMenu,
	} = useContextMenu<ScryfallCard>();

	// Narrow the in-collection overlay to legal + commander-CI cards (deck rules).
	const filterCollection = useCallback(
		<T extends AnyCard>(cards: T[]): T[] => {
			if (!(showLegalToggle && legalOnly && deckFormat)) return cards;
			const fmt = deckFormat as import('@/lib/scryfall/types/scryfall').ScryfallFormat;
			const legalFiltered = cards.filter((c) => (c as ScryfallCard).legalities?.[fmt] === 'legal');
			if (isCommanderFormat && commanderColorIdentity && commanderColorIdentity.length > 0) {
				return legalFiltered.filter((c) =>
					((c as ScryfallCard).color_identity ?? []).every((ci) =>
						commanderColorIdentity.includes(ci)
					)
				);
			}
			return legalFiltered;
		},
		[showLegalToggle, legalOnly, deckFormat, isCommanderFormat, commanderColorIdentity]
	);

	// Compute the deck steering from the live search state each render (pure).
	const getDeckSteering = useCallback(
		(state: SearchState): DeckSteering => {
			// Tokens have no legality/CI constraint.
			const legalFilter = !isTokenMode && showLegalToggle && legalOnly ? deckFormat : undefined;
			const colorIdentityFilter =
				legalFilter && isCommanderFormat ? commanderColorIdentity : undefined;

			// User CI selection intersects with the commander constraint (both "at most").
			let effectiveColorIdentity: ScryfallColor[];
			if (colorIdentityFilter && colorIdentityFilter.length > 0) {
				effectiveColorIdentity =
					state.colorIdentity.length > 0
						? state.colorIdentity.filter((c) => colorIdentityFilter.includes(c))
						: colorIdentityFilter;
			} else {
				effectiveColorIdentity = state.colorIdentity;
			}
			const colorIdentityToApply =
				effectiveColorIdentity.length > 0 ? effectiveColorIdentity : undefined;

			const commanderConstrained = !!colorIdentityFilter && colorIdentityFilter.length > 0;
			const intersectionShrunk =
				commanderConstrained && state.colorIdentity.length !== effectiveColorIdentity.length;
			const userCiImpossible =
				commanderConstrained &&
				state.colorIdentity.length > 0 &&
				(effectiveColorIdentity.length === 0 ||
					(state.colorIdentityMatch === 'exact' && intersectionShrunk));

			return {
				inCollectionOnly,
				matchNothing: userCiImpossible,
				extraFilters: {
					legal: legalFilter,
					colorIdentity: colorIdentityToApply,
					matchNothing: userCiImpossible,
				},
				filterCollection,
			};
		},
		[
			isTokenMode,
			showLegalToggle,
			legalOnly,
			deckFormat,
			isCommanderFormat,
			commanderColorIdentity,
			inCollectionOnly,
			filterCollection,
		]
	);

	const handleAddCardClick = useCallback(
		(card: AnyCard) => {
			let scryfallCard: ScryfallCard;
			if ('entry' in card) {
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				const { entry: _, ...rest } = card as import('@/types/cards').Card;
				scryfallCard = rest as ScryfallCard;
			} else {
				scryfallCard = card as ScryfallCard;
			}
			if (isTokenMode) {
				addCardToDeck(deckId, scryfallCard, 'tokens');
			} else {
				onCardClick(scryfallCard);
			}
		},
		[isTokenMode, addCardToDeck, deckId, onCardClick]
	);

	const renderOverlay = useCallback(
		(card: AnyCard) => (
			<>
				<div
					className={styles.searchCardOverlay}
					onContextMenu={(e) => openContextMenu(card as ScryfallCard, e)}
				/>
				<DeckZoneBadges zones={getDeckZones(card.oracle_id)} />
			</>
		),
		[openContextMenu, getDeckZones]
	);

	const renderToggles = useCallback(
		() => (
			<>
				{showLegalToggle && (
					<label className={styles.toggleLabel}>
						<input
							type="checkbox"
							checked={legalOnly}
							onChange={(e) => setLegalOnly(e.target.checked)}
							className={styles.toggleInput}
						/>
						<span className={styles.toggleText}>
							{t('legalInFormatOnly', { format: deckFormat })}
						</span>
					</label>
				)}
				<label className={styles.toggleLabel}>
					<input
						type="checkbox"
						checked={inCollectionOnly}
						onChange={(e) => {
							const next = e.target.checked;
							setInCollectionOnly(next);
							onCollectionModeChange?.(next);
						}}
						className={styles.toggleInput}
					/>
					<span className={styles.toggleText}>{t('inCollectionOnly')}</span>
				</label>
			</>
		),
		[showLegalToggle, legalOnly, deckFormat, inCollectionOnly, onCollectionModeChange, t]
	);

	const edhrecBody =
		activeTab === 'edhrec' ? (
			<EdhrecRecommendations
				commanderName={commanderName ?? null}
				onCardClick={handleAddCardClick}
				renderOverlay={renderOverlay}
			/>
		) : undefined;

	return (
		<SearchPanelCore
			title={t('addCards')}
			expanded={expanded}
			onToggleExpand={onToggleExpand}
			onClose={onClose}
			onCardClick={handleAddCardClick}
			renderOverlay={renderOverlay}
			showTokenMode
			onTokenModeChange={setIsTokenMode}
			hideMultilingual={false}
			renderToggles={renderToggles}
			tabs={showEdhrecTab ? <PanelTabs value={activeTab} onChange={setTab} /> : undefined}
			bodyOverride={edhrecBody}
			getDeckSteering={getDeckSteering}
			footer={
				contextMenu ? (
					<SearchCardContextMenu
						card={contextMenu.data}
						position={contextMenu.position}
						deckId={deckId}
						format={deckFormat}
						onCardClick={onCardClick}
						onClose={closeContextMenu}
						inCollectionOnly={inCollectionOnly}
						collectionEntries={collectionEntries}
						scryfallIdToOracleId={scryfallIdToOracleId}
					/>
				) : undefined
			}
		/>
	);
}
