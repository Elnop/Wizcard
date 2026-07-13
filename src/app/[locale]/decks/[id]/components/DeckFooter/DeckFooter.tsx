'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import type { DeckStats } from '@/lib/deck/utils/deck-stats';
import type { DeckFormat } from '@/types/decks';
import type { ValidationWarning } from '@/lib/deck/utils/format-rules';
import { getFormatRules } from '@/lib/deck/utils/format-rules';
import { ColorIdentityIcons } from '@/lib/scryfall/components/ColorIdentityIcons';
import styles from './DeckFooter.module.css';

const COLOR_ORDER = ['W', 'U', 'B', 'R', 'G'] as const;

type Props = {
	stats: DeckStats;
	format: DeckFormat | null;
	warnings: ValidationWarning[];
};

export function DeckFooter({ stats, format, warnings }: Props) {
	const t = useTranslations('decks');
	const [warningsOpen, setWarningsOpen] = useState(false);
	const panelRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);

	const rules = format ? getFormatRules(format) : null;
	const target = rules ? rules.minMainboard + rules.commanderCount : null;
	const current = stats.mainboardCount + stats.commanderCount;
	const isValid = target !== null && current >= target;

	const colors = COLOR_ORDER.filter((c) => stats.colorDistribution[c]);

	useEffect(() => {
		if (!warningsOpen) return;
		function handleClickOutside(e: MouseEvent) {
			if (
				panelRef.current &&
				!panelRef.current.contains(e.target as Node) &&
				triggerRef.current &&
				!triggerRef.current.contains(e.target as Node)
			) {
				setWarningsOpen(false);
			}
		}
		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, [warningsOpen]);

	return (
		<footer className={styles.footer}>
			{warnings.length > 0 && (
				<div
					ref={panelRef}
					className={`${styles.warningsPanel} ${warningsOpen ? styles.warningsPanelOpen : ''}`}
				>
					<div className={styles.warningsPanelInner}>
						{warnings.map((w, i) => (
							<div key={i} className={styles.warningItem}>
								{w.message}
							</div>
						))}
					</div>
				</div>
			)}

			<div className={styles.inner}>
				<div className={styles.left}>
					{format && (
						<>
							<div className={styles.item}>
								<span className={styles.format}>{format}</span>
							</div>
							<div className={styles.separator} />
						</>
					)}

					{target !== null ? (
						<div className={`${styles.item} ${isValid ? styles.valid : styles.invalid}`}>
							<span className={styles.value}>{current}</span>
							<span className={styles.label}>{t('footerCards')}</span>
						</div>
					) : (
						<div className={styles.item}>
							<span className={styles.value}>{stats.totalCards}</span>
							<span className={styles.label}>{t('footerTotal')}</span>
						</div>
					)}

					{stats.sideboardCount > 0 && (
						<>
							<div className={styles.separator} />
							<div className={styles.item}>
								<span className={styles.value}>{stats.sideboardCount}</span>
								<span className={styles.label}>{t('footerSide')}</span>
							</div>
						</>
					)}

					{stats.commanderCount > 0 && (
						<>
							<div className={styles.separator} />
							<div className={styles.item}>
								<span className={styles.value}>{stats.commanderCount}</span>
								<span className={styles.label}>{t('footerCmdr')}</span>
							</div>
						</>
					)}
				</div>

				<div className={styles.right}>
					<div className={styles.item}>
						<span className={styles.value}>{stats.landCount}</span>
						<span className={styles.label}>{t('footerLands')}</span>
					</div>

					<div className={styles.separator} />

					<div className={styles.item}>
						<span className={styles.value}>{stats.averageCmc.toFixed(1)}</span>
						<span className={styles.label}>{t('footerCmc')}</span>
					</div>

					{colors.length > 0 && (
						<>
							<div className={styles.separator} />
							<div className={styles.colorDots}>
								<ColorIdentityIcons colors={colors} size={18} />
							</div>
						</>
					)}

					{warnings.length > 0 && (
						<>
							<div className={styles.separator} />
							<button
								ref={triggerRef}
								type="button"
								className={`${styles.warningsTrigger} ${warningsOpen ? styles.warningsTriggerOpen : ''}`}
								onClick={() => setWarningsOpen((v) => !v)}
							>
								<span className={styles.warningsValue}>{warnings.length}</span>
								<span className={styles.warningsLabel}>{t('footerWarns')}</span>
								<span className={styles.chevron} />
							</button>
						</>
					)}
				</div>
			</div>
		</footer>
	);
}
