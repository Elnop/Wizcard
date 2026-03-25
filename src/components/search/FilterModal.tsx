'use client';

import { useEffect, useRef, useState } from 'react';
import type { ScryfallColor, ScryfallSet } from '@/lib/scryfall/types/scryfall';
import type {
	ScryfallSortOrder,
	ScryfallSortDir,
} from '@/lib/scryfall/hooks/useScryfallCardSearch';
import { useScryfallSymbols } from '@/lib/scryfall/hooks/useScryfallSymbols';
import { ColorFilter } from './ColorFilter';
import { RarityFilter } from './RarityFilter';
import { TypeFilter } from './TypeFilter';
import { OracleTextFilter } from './OracleTextFilter';
import { CmcFilter } from './CmcFilter';
import { SetFilter } from './SetFilter';
import { SortFilter } from './SortFilter';
import styles from './FilterModal.module.css';

interface FilterModalProps {
	isOpen: boolean;
	colors: ScryfallColor[];
	colorMatch?: 'exact' | 'include' | 'atMost';
	type: string;
	set: string;
	rarities: string[];
	oracleText: string;
	cmc: string;
	sets: ScryfallSet[];
	setsLoading?: boolean;
	order: ScryfallSortOrder;
	dir: ScryfallSortDir;
	onApply: (filters: {
		colors: ScryfallColor[];
		colorMatch: 'exact' | 'include' | 'atMost';
		type: string;
		set: string;
		rarities: string[];
		oracleText: string;
		cmc: string;
		order: ScryfallSortOrder;
		dir: ScryfallSortDir;
	}) => void;
	onClose: () => void;
}

interface FilterModalContentProps {
	sets: ScryfallSet[];
	setsLoading?: boolean;
	initialColors: ScryfallColor[];
	initialColorMatch: 'exact' | 'include' | 'atMost';
	initialType: string;
	initialSet: string;
	initialRarities: string[];
	initialOracleText: string;
	initialCmc: string;
	initialOrder: ScryfallSortOrder;
	initialDir: ScryfallSortDir;
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
	onApply,
	onClose,
}: FilterModalContentProps) {
	const symbolMap = useScryfallSymbols();
	const [draftColors, setDraftColors] = useState<ScryfallColor[]>(initialColors);
	const [draftColorMatch, setDraftColorMatch] = useState<'exact' | 'include' | 'atMost'>(
		initialColorMatch
	);
	const [draftType, setDraftType] = useState(initialType);
	const [draftSet, setDraftSet] = useState(initialSet);
	const [draftRarities, setDraftRarities] = useState<string[]>(initialRarities);
	const [draftOracleText, setDraftOracleText] = useState(initialOracleText);
	const [draftCmc, setDraftCmc] = useState(initialCmc);
	const [draftOrder, setDraftOrder] = useState<ScryfallSortOrder>(initialOrder);
	const [draftDir, setDraftDir] = useState<ScryfallSortDir>(initialDir);

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
		});
		onClose();
	};

	const handleReset = () => {
		setDraftColors([]);
		setDraftColorMatch('include');
		setDraftType('');
		setDraftSet('');
		setDraftRarities([]);
		setDraftOracleText('');
		setDraftCmc('');
		setDraftOrder('name');
		setDraftDir('auto');
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
				<SetFilter value={draftSet} onChange={setDraftSet} sets={sets} isLoading={setsLoading} />
				<SortFilter
					order={draftOrder}
					onOrderChange={(v) => setDraftOrder(v as ScryfallSortOrder)}
					dir={draftDir}
					onDirChange={setDraftDir}
				/>
			</div>

			<div className={styles.footer}>
				<button type="button" className={styles.resetButton} onClick={handleReset}>
					Réinitialiser
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
	onApply,
	onClose,
}: FilterModalProps) {
	const dialogRef = useRef<HTMLDialogElement>(null);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (isOpen) {
			dialog?.showModal();
			document.body.style.overflow = 'hidden';
		} else {
			dialog?.close();
			document.body.style.overflow = '';
		}
		return () => {
			document.body.style.overflow = '';
		};
	}, [isOpen]);

	const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
		if (e.target === dialogRef.current) onClose();
	};

	return (
		<dialog
			ref={dialogRef}
			className={styles.dialog}
			aria-modal="true"
			aria-label="Filtres"
			onClick={handleBackdropClick}
			onCancel={onClose}
		>
			{isOpen && (
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
					onApply={onApply}
					onClose={onClose}
				/>
			)}
		</dialog>
	);
}
