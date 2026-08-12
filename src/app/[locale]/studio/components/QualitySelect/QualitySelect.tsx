'use client';

import { useTranslations } from 'next-intl';
import { CARD_QUALITIES, QUALITY_WIDTH, type CardQuality } from '@/lib/card-editor/quality';
import styles from './QualitySelect.module.css';

/**
 * Sélecteur de palier de qualité, partagé par l'aperçu et l'export.
 *
 * Un seul composant pour les deux usages parce que la liste des paliers est la
 * même : ce qui change est le libellé et la valeur par défaut, pas les options.
 * Les dédoubler ferait diverger les deux listes au premier palier ajouté.
 *
 * La largeur en pixels est affichée à côté de chaque libellé : « Haute » ne dit
 * rien en soi, « Haute — 1500 px » permet de choisir en connaissance de cause,
 * surtout à l'export où l'utilisateur sait quelle taille il vise.
 */
export function QualitySelect({
	value,
	onChange,
	label,
	id,
}: {
	value: CardQuality;
	onChange: (quality: CardQuality) => void;
	label: string;
	id: string;
}) {
	const t = useTranslations('cardEditor.quality');

	return (
		<div className={styles.field}>
			<label htmlFor={id} className={styles.label}>
				{label}
			</label>
			<select
				id={id}
				className={styles.select}
				value={value}
				onChange={(event) => onChange(event.target.value as CardQuality)}
			>
				{CARD_QUALITIES.map((quality) => (
					<option key={quality} value={quality}>
						{t(quality)} — {QUALITY_WIDTH[quality]} px
					</option>
				))}
			</select>
			<p className={styles.hint}>{t(`${value}Hint`)}</p>
		</div>
	);
}
