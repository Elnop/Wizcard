'use client';

import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { Modal } from '@/components/Modal/Modal';
import { PrintList } from '@/lib/card/components/PrintList/PrintList';
import type { CollectionCopyEntry } from '@/lib/card/components/PrintList/PrintList.types';
import styles from './CardPrintPickerModal.module.css';

export type { CollectionCopyEntry };

interface Props {
	prints_search_uri: string;
	currentCardId: string;
	currentSet?: string;
	currentCollectorNumber?: string;
	currentLang?: string;
	onSelect: (print: ScryfallCard) => void;
	onClose: () => void;
	collectionCopies?: CollectionCopyEntry[];
	onSelectCollectionCopy?: (rowId: string) => void;
}

export function CardPrintPickerModal({
	prints_search_uri,
	currentCardId,
	currentSet,
	currentCollectorNumber,
	currentLang,
	onSelect,
	onClose,
	collectionCopies,
	onSelectCollectionCopy,
}: Props) {
	return (
		<Modal onClose={onClose} className={styles.modal} zIndex={1100}>
			<div className={styles.header}>
				<h2 className={styles.title}>Changer d&apos;édition</h2>
				<button className={styles.closeIcon} onClick={onClose} aria-label="Fermer" type="button">
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
			<div className={styles.body}>
				<PrintList
					prints_search_uri={prints_search_uri}
					currentCardId={currentCardId}
					currentSet={currentSet}
					currentCollectorNumber={currentCollectorNumber}
					currentLang={currentLang}
					onSelect={(print) => {
						onSelect(print);
						onClose();
					}}
					collectionCopies={collectionCopies}
					onSelectCollectionCopy={(rowId) => {
						onSelectCollectionCopy?.(rowId);
						onClose();
					}}
				/>
			</div>
		</Modal>
	);
}
