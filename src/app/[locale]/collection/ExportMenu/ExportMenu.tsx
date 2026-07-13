'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Card } from '@/types/cards';
import { Button } from '@/components/Button/Button';
import { downloadCSV } from '@/lib/csv/download';
import { serializeToMoxfieldCSV } from '@/lib/moxfield/serialize';
import { serializeToCardNexusCSV } from '@/lib/cardnexus/serialize';
import styles from './ExportMenu.module.css';

interface ExportMenuProps {
	cards: Card[];
	/** Base filename without extension, e.g. "my-collection". */
	filenameBase: string;
	disabled?: boolean;
}

export function ExportMenu({ cards, filenameBase, disabled }: ExportMenuProps) {
	const t = useTranslations('collection');
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onClick = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
		};
		document.addEventListener('mousedown', onClick);
		return () => document.removeEventListener('mousedown', onClick);
	}, [open]);

	const exportMoxfield = useCallback(() => {
		downloadCSV(serializeToMoxfieldCSV(cards), `${filenameBase}-moxfield.csv`);
		setOpen(false);
	}, [cards, filenameBase]);

	const exportCardNexus = useCallback(() => {
		downloadCSV(serializeToCardNexusCSV(cards), `${filenameBase}-cardnexus.csv`);
		setOpen(false);
	}, [cards, filenameBase]);

	return (
		<div className={styles.wrapper} ref={ref}>
			<Button variant="secondary" onClick={() => setOpen((v) => !v)} disabled={disabled}>
				{t('export')} ▾
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
