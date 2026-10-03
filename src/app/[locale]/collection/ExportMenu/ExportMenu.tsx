'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { CardCopy } from '@/types/cards';
import { Button } from '@/components/Button/Button';
import { downloadCSV } from '@/lib/csv/download';
import { serializeToMoxfieldCSV } from '@/lib/moxfield/serialize';
import { serializeToCardNexusCSV } from '@/lib/cardnexus/serialize';
import styles from './ExportMenu.module.css';

interface ExportMenuProps {
	cards: CardCopy[] | (() => Promise<CardCopy[]>);
	/** Base filename without extension, e.g. "my-collection". */
	filenameBase: string;
	disabled?: boolean;
}

export function ExportMenu({ cards, filenameBase, disabled }: ExportMenuProps) {
	const t = useTranslations('collection');
	const [open, setOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onClick = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
		};
		document.addEventListener('mousedown', onClick);
		return () => document.removeEventListener('mousedown', onClick);
	}, [open]);

	const getCards = useCallback(
		async () => (typeof cards === 'function' ? cards() : cards),
		[cards]
	);

	const exportWith = useCallback(
		(serialize: (c: CardCopy[]) => string, suffix: string) => {
			setOpen(false);
			setBusy(true);
			void getCards()
				.then((list) => downloadCSV(serialize(list), `${filenameBase}-${suffix}.csv`))
				.catch((err) => console.error('[ExportMenu] export failed:', err))
				.finally(() => setBusy(false));
		},
		[getCards, filenameBase]
	);
	const exportMoxfield = useCallback(
		() => exportWith(serializeToMoxfieldCSV, 'moxfield'),
		[exportWith]
	);
	const exportCardNexus = useCallback(
		() => exportWith(serializeToCardNexusCSV, 'cardnexus'),
		[exportWith]
	);

	return (
		<div className={styles.wrapper} ref={ref}>
			<Button variant="secondary" onClick={() => setOpen((v) => !v)} disabled={disabled || busy}>
				{busy ? t('exporting') : `${t('export')} ▾`}
			</Button>
			{open && (
				<div className={styles.dropdown}>
					<button type="button" className={styles.dropdownItem} onClick={exportMoxfield}>
						Moxfield CSV
					</button>
					<button type="button" className={styles.dropdownItem} onClick={exportCardNexus}>
						CardNexus CSV
					</button>
				</div>
			)}
		</div>
	);
}
