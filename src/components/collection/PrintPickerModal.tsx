'use client';

import { useState } from 'react';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { useCardPrints } from '@/lib/scryfall/hooks/useCardPrints';
import { CardImage } from '@/components/cards/CardImage';
import { Modal } from '@/components/ui/Modal';
import styles from './PrintPickerModal.module.css';
import lightboxStyles from './lightbox.module.css';

const LANG_NAMES: Record<string, string> = {
	en: 'English',
	fr: 'French',
	de: 'German',
	es: 'Spanish',
	it: 'Italian',
	pt: 'Portuguese',
	ja: 'Japanese',
	ko: 'Korean',
	ru: 'Russian',
	zhs: 'Simplified Chinese',
	zht: 'Traditional Chinese',
	ph: 'Phyrexian',
	he: 'Hebrew',
	ar: 'Arabic',
	la: 'Latin',
	grc: 'Ancient Greek',
	sa: 'Sanskrit',
};

function langName(code: string): string {
	return LANG_NAMES[code] ?? code.toUpperCase();
}

interface Props {
	prints_search_uri: string;
	currentCardId: string;
	onSelect: (print: ScryfallCard) => void;
	onClose: () => void;
}

export function PrintPickerModal({ prints_search_uri, currentCardId, onSelect, onClose }: Props) {
	const { prints, loading, error } = useCardPrints(prints_search_uri);
	const [lightboxCard, setLightboxCard] = useState<ScryfallCard | null>(null);

	const byLang = new Map<string, ScryfallCard[]>();
	for (const p of prints) {
		const lang = p.lang ?? 'en';
		const arr = byLang.get(lang) ?? [];
		arr.push(p);
		byLang.set(lang, arr);
	}

	const langs = Array.from(byLang.keys()).sort((a, b) => {
		if (a === 'en') return -1;
		if (b === 'en') return 1;
		return langName(a).localeCompare(langName(b));
	});

	return (
		<>
			<Modal onClose={onClose} className={styles.modal} zIndex={1100}>
				<div className={styles.header}>
					<h2 className={styles.title}>Change Print</h2>
					<button className={styles.closeIcon} onClick={onClose} aria-label="Close" type="button">
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
					{loading && <p className={styles.status}>Loading prints…</p>}
					{error && <p className={styles.statusError}>{error}</p>}
					{!loading && !error && prints.length === 0 && (
						<p className={styles.status}>No prints found.</p>
					)}

					{langs.map((lang) => {
						const langPrints = byLang.get(lang)!;
						return (
							<details key={lang} className={styles.accordion} open={lang === 'en'}>
								<summary className={styles.accordionSummary}>
									{langName(lang)}
									<span className={styles.accordionCount}>{langPrints.length}</span>
								</summary>
								<ul className={styles.grid}>
									{langPrints.map((print) => (
										<li key={print.id} className={styles.printItem}>
											<div
												className={`${styles.printCard} ${print.id === currentCardId ? styles.printCardActive : ''}`}
											>
												<button
													type="button"
													className={styles.printImageBtn}
													onClick={() => setLightboxCard(print)}
													aria-label={`Preview ${print.set_name}`}
												>
													<CardImage card={print} size="normal" />
												</button>
												<button
													type="button"
													className={`${styles.selectBtn} ${print.id === currentCardId ? styles.selectBtnActive : ''}`}
													onClick={() => onSelect(print)}
												>
													{print.id === currentCardId ? 'Selected' : 'Select'}
												</button>
											</div>
										</li>
									))}
								</ul>
							</details>
						);
					})}
				</div>
			</Modal>

			{lightboxCard && (
				<div className={lightboxStyles.lightbox} onClick={() => setLightboxCard(null)}>
					<div className={lightboxStyles.lightboxCard} onClick={(e) => e.stopPropagation()}>
						<CardImage card={lightboxCard} size="large" priority />
					</div>
				</div>
			)}
		</>
	);
}
