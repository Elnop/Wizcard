'use client';

import { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import styles from './PrintContextMenu.module.css';

interface Props {
	card: ScryfallCard;
	pos: { x: number; y: number } | null;
	onClose: () => void;
	onAddToCollection: (card: ScryfallCard) => void;
	onAddToWishlist: (card: ScryfallCard) => void;
}

export function PrintContextMenu({
	card,
	pos,
	onClose,
	onAddToCollection,
	onAddToWishlist,
}: Props) {
	const close = useCallback(() => onClose(), [onClose]);

	useEffect(() => {
		if (!pos) return;
		const onClick = () => close();
		const onCtxMenu = () => close();
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') close();
		};
		const onScroll = () => close();
		document.addEventListener('click', onClick);
		document.addEventListener('contextmenu', onCtxMenu, true);
		document.addEventListener('keydown', onKey);
		document.addEventListener('scroll', onScroll, true);
		return () => {
			document.removeEventListener('click', onClick);
			document.removeEventListener('contextmenu', onCtxMenu, true);
			document.removeEventListener('keydown', onKey);
			document.removeEventListener('scroll', onScroll, true);
		};
	}, [pos, close]);

	if (!pos) return null;

	return createPortal(
		<div
			className={styles.menu}
			style={{ left: pos.x, top: pos.y }}
			onClick={(e) => e.stopPropagation()}
		>
			<button
				type="button"
				className={styles.item}
				onClick={() => {
					onAddToCollection(card);
					close();
				}}
			>
				<span className={styles.icon}>+</span>
				Add to collection
			</button>
			<button
				type="button"
				className={styles.item}
				onClick={() => {
					onAddToWishlist(card);
					close();
				}}
			>
				<span className={styles.icon}>♡</span>
				Add to Wishlist
			</button>
		</div>,
		document.body
	);
}
