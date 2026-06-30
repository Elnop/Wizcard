'use client';

import { useState } from 'react';
import type { ScryfallColor, ScryfallSet } from '@/lib/scryfall/types/scryfall';
import type { ScryfallSortOrder, ScryfallSortDir } from '@/lib/scryfall/types/sort';
import type { ColorMatch } from '@/lib/search/types';
import type { MpcSourceWithCount } from '@/lib/mpc/db/custom-cards';
import type { CardType } from '@/lib/mpc/types';
import { useScryfallSymbols } from '@/lib/scryfall/hooks/useScryfallSymbols';
import { Modal } from '@/components/Modal/Modal';
import { ColorFilter } from '@/lib/search/components/filters/ColorFilter/ColorFilter';
import { RarityFilter } from '@/lib/search/components/filters/RarityFilter/RarityFilter';
import { TypeFilter } from '@/lib/search/components/filters/TypeFilter/TypeFilter';
import { OracleTextFilter } from '@/lib/search/components/filters/OracleTextFilter/OracleTextFilter';
import { CmcFilter } from '@/lib/search/components/filters/CmcFilter/CmcFilter';
import { SetFilter } from '@/lib/search/components/filters/SetFilter/SetFilter';
import { SortFilter } from '@/lib/search/components/filters/SortFilter/SortFilter';
import { CustomSourceFilter } from '@/lib/search/components/filters/CustomSourceFilter/CustomSourceFilter';
import { CardTypeFilter } from '@/lib/search/components/filters/CardTypeFilter/CardTypeFilter';
import { MpcTagsFilter } from '@/lib/search/components/filters/MpcTagsFilter/MpcTagsFilter';
import type { MpcTagsFilterValue } from '@/lib/search/components/filters/MpcTagsFilter/MpcTagsFilter';
import { OracleIdFilter } from '@/lib/search/components/filters/OracleIdFilter/OracleIdFilter';
import type { OracleIdFilterValue } from '@/lib/search/components/filters/OracleIdFilter/OracleIdFilter';
import styles from './FilterModal.module.css';

const DEFAULT_MPC_TAGS: MpcTagsFilterValue = { mustHave: [], mustNotHave: ['NSFW'] };

export type FilterModalVariant = 'default' | 'search' | 'backs';

interface FilterModalProps {
	isOpen: boolean;
	colors: ScryfallColor[];
	colorMatch?: ColorMatch;
	type: string[];
	set: string;
	rarities: string[];
	oracleText: string;
	cmc: string;
	sets: ScryfallSet[];
	setsLoading?: boolean;
	order: ScryfallSortOrder;
	dir: ScryfallSortDir;
	customSources?: MpcSourceWithCount[];
	customSourceId?: string | null;
	cardTypeFilter?: CardType | 'all';
	mpcTags?: MpcTagsFilterValue;
	oracleIdFilter?: OracleIdFilterValue;
	variant?: FilterModalVariant;
	onApply: (filters: {
		colors: ScryfallColor[];
		colorMatch: ColorMatch;
		type: string[];
		set: string;
		rarities: string[];
		oracleText: string;
		cmc: string;
		order: ScryfallSortOrder;
		dir: ScryfallSortDir;
		customSourceId: string | null;
		cardTypeFilter: CardType | 'all';
		mpcTags: MpcTagsFilterValue;
		oracleIdFilter: OracleIdFilterValue;
	}) => void;
	onClose: () => void;
}

interface FilterModalContentProps {
	sets: ScryfallSet[];
	setsLoading?: boolean;
	initialColors: ScryfallColor[];
	initialColorMatch: 'exact' | 'include' | 'atMost';
	initialType: string[];
	initialSet: string;
	initialRarities: string[];
	initialOracleText: string;
	initialCmc: string;
	initialOrder: ScryfallSortOrder;
	initialDir: ScryfallSortDir;
	customSources: MpcSourceWithCount[];
	initialCustomSourceId: string | null;
	initialCardTypeFilter: CardType | 'all';
	initialMpcTags: MpcTagsFilterValue;
	initialOracleIdFilter: OracleIdFilterValue;
	variant: FilterModalVariant;
	onApply: FilterModalProps['onApply'];
	onClose: () => void;
}

function FilterModalContent({
	sets,
	setsLoading,
	initialColors,
	initialColorMatch,
	initialType,
	initialSet,
	initialRarities,
	initialOracleText,
	initialCmc,
	initialOrder,
	initialDir,
	customSources,
	initialCustomSourceId,
	initialCardTypeFilter,
	initialMpcTags,
	initialOracleIdFilter,
	variant,
	onApply,
	onClose,
}: FilterModalContentProps) {
	const symbolMap = useScryfallSymbols();
	const [draftColors, setDraftColors] = useState<ScryfallColor[]>(initialColors);
	const [draftColorMatch, setDraftColorMatch] = useState<'exact' | 'include' | 'atMost'>(
		initialColorMatch
	);
	const [draftType, setDraftType] = useState<string[]>(initialType);
	const [draftSet, setDraftSet] = useState(initialSet);
	const [draftRarities, setDraftRarities] = useState<string[]>(initialRarities);
	const [draftOracleText, setDraftOracleText] = useState(initialOracleText);
	const [draftCmc, setDraftCmc] = useState(initialCmc);
	const [draftOrder, setDraftOrder] = useState<ScryfallSortOrder>(initialOrder);
	const [draftDir, setDraftDir] = useState<ScryfallSortDir>(initialDir);
	const [draftCustomSourceId, setDraftCustomSourceId] = useState<string | null>(
		initialCustomSourceId
	);
	const [draftCardTypeFilter, setDraftCardTypeFilter] = useState<CardType | 'all'>(
		initialCardTypeFilter
	);
	const [draftMpcTags, setDraftMpcTags] = useState<MpcTagsFilterValue>(initialMpcTags);
	const [draftOracleIdFilter, setDraftOracleIdFilter] =
		useState<OracleIdFilterValue>(initialOracleIdFilter);

	// Hidden sections' drafts are emitted unchanged on purpose: filters set in another
	// variant survive in the URL, and the consumer neutralizes them at query time.
	const handleApply = () => {
		onApply({
			colors: draftColors,
			colorMatch: draftColorMatch,
			type: draftType,
			set: draftSet,
			rarities: draftRarities,
			oracleText: draftOracleText,
			cmc: draftCmc,
			order: draftOrder,
			dir: draftDir,
			customSourceId: draftCustomSourceId,
			cardTypeFilter: draftCardTypeFilter,
			mpcTags: draftMpcTags,
			oracleIdFilter: draftOracleIdFilter,
		});
		onClose();
	};

	const handleReset = () => {
		if (variant !== 'backs') {
			setDraftColors([]);
			setDraftColorMatch('include');
			setDraftType([]);
			setDraftSet('');
			setDraftRarities([]);
			setDraftOracleText('');
			setDraftCmc('');
			setDraftOrder('name');
			setDraftDir('auto');
			setDraftOracleIdFilter('all');
		}
		if (variant === 'default') {
			setDraftCardTypeFilter('all');
		}
		setDraftCustomSourceId(null);
		setDraftMpcTags(DEFAULT_MPC_TAGS);
	};

	return (
		<div className={styles.panel}>
			<div className={styles.header}>
				<span className={styles.title}>Filtres</span>
				<button type="button" className={styles.closeButton} onClick={onClose} aria-label="Fermer">
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path
							d="M12 4L4 12M4 4l8 8"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
						/>
					</svg>
				</button>
			</div>

			<div className={styles.body}>
				{variant !== 'backs' && (
					<>
						<ColorFilter
							selected={draftColors}
							onChange={setDraftColors}
							colorMatch={draftColorMatch}
							onColorMatchChange={setDraftColorMatch}
							symbolMap={symbolMap}
						/>
						<RarityFilter value={draftRarities} onChange={setDraftRarities} />
						<TypeFilter value={draftType} onChange={setDraftType} />
						<OracleTextFilter value={draftOracleText} onChange={setDraftOracleText} />
						<CmcFilter value={draftCmc} onChange={setDraftCmc} />
						<SetFilter
							value={draftSet}
							onChange={setDraftSet}
							sets={sets}
							isLoading={setsLoading}
						/>
						<SortFilter
							order={draftOrder}
							onOrderChange={(v) => setDraftOrder(v as ScryfallSortOrder)}
							dir={draftDir}
							onDirChange={setDraftDir}
						/>
					</>
				)}
				{variant === 'default' && (
					<CardTypeFilter value={draftCardTypeFilter} onChange={setDraftCardTypeFilter} />
				)}

				{customSources.length > 0 && (
					<>
						<div className={styles.sectionDivider} />
						<div className={styles.sectionTitle}>Custom Cards</div>
						<CustomSourceFilter
							sources={customSources}
							value={draftCustomSourceId}
							onChange={setDraftCustomSourceId}
						/>
						<MpcTagsFilter value={draftMpcTags} onChange={setDraftMpcTags} />
						{variant !== 'backs' && (
							<OracleIdFilter value={draftOracleIdFilter} onChange={setDraftOracleIdFilter} />
						)}
					</>
				)}
			</div>

			<div className={styles.footer}>
				<button type="button" className={styles.resetButton} onClick={handleReset}>
					Reset
				</button>
				<button type="button" className={styles.applyButton} onClick={handleApply}>
					Appliquer
				</button>
			</div>
		</div>
	);
}

export function FilterModal({
	isOpen,
	colors,
	colorMatch = 'include',
	type,
	set,
	rarities,
	oracleText,
	cmc,
	sets,
	setsLoading,
	order,
	dir,
	customSources = [],
	customSourceId = null,
	cardTypeFilter = 'all',
	mpcTags = DEFAULT_MPC_TAGS,
	oracleIdFilter = 'all',
	variant = 'default',
	onApply,
	onClose,
}: FilterModalProps) {
	if (!isOpen) return null;

	return (
		<Modal onClose={onClose} className={styles.panel}>
			<FilterModalContent
				key={String(isOpen)}
				sets={sets}
				setsLoading={setsLoading}
				initialColors={colors}
				initialColorMatch={colorMatch}
				initialType={type}
				initialSet={set}
				initialRarities={rarities}
				initialOracleText={oracleText}
				initialCmc={cmc}
				initialOrder={order}
				initialDir={dir}
				customSources={customSources}
				initialCustomSourceId={customSourceId}
				initialCardTypeFilter={cardTypeFilter}
				initialMpcTags={mpcTags}
				initialOracleIdFilter={oracleIdFilter}
				variant={variant}
				onApply={onApply}
				onClose={onClose}
			/>
		</Modal>
	);
}
