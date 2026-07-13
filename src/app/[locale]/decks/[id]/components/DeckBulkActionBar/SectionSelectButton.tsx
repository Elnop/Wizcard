'use client';

import styles from './SectionSelectButton.module.css';

type Props = {
	allSelected: boolean;
	onToggle: () => void;
};

/** "Select all" toggle rendered in a CardList section/sub-section header while
 * the deck is in bulk-selection mode. */
export function SectionSelectButton({ allSelected, onToggle }: Props) {
	return (
		<button
			type="button"
			className={`${styles.button} ${allSelected ? styles.active : ''}`}
			onClick={onToggle}
			aria-pressed={allSelected}
		>
			{allSelected ? 'Deselect all' : 'Select all'}
		</button>
	);
}
