'use client';

import { useMemo, useState } from 'react';
import { X } from '@phosphor-icons/react';
import { useTranslations } from 'next-intl';
import {
	composeTypeLine,
	normalizeTypeValue,
	parseTypeLine,
	splitTypeInput,
	type TypeLineParts,
} from '@/lib/card-editor/type-line';
import { useCardTypeVocabulary } from '@/lib/scryfall/hooks/useCardTypeVocabulary';
import styles from './TypeLineField.module.css';

/** Suggestions affichées à la fois — au-delà la liste devient illisible. */
const MAX_SUGGESTIONS = 8;

type TypeGroup = keyof TypeLineParts;

/**
 * Une des trois listes de la ligne de type, éditée comme des tags.
 *
 * Saisie : virgule ou Entrée valide la valeur courante, Retour arrière sur un
 * champ vide retire le dernier tag. Les suggestions filtrent le vocabulaire
 * Scryfall, mais une valeur libre reste acceptée — le studio sert aussi à
 * inventer des types.
 */
function TypeTagInput({
	label,
	placeholder,
	values,
	vocabulary,
	onChange,
}: {
	label: string;
	placeholder: string;
	values: string[];
	vocabulary: string[];
	onChange: (values: string[]) => void;
}) {
	const [draft, setDraft] = useState('');

	const suggestions = useMemo(() => {
		const query = draft.trim().toLowerCase();
		if (!query) return [];
		const taken = new Set(values.map((value) => value.toLowerCase()));
		return vocabulary
			.filter((entry) => entry.toLowerCase().includes(query) && !taken.has(entry.toLowerCase()))
			.slice(0, MAX_SUGGESTIONS);
	}, [draft, values, vocabulary]);

	function commit(raw: string) {
		const taken = new Set(values.map((value) => value.toLowerCase()));
		const added = splitTypeInput(raw)
			.map((value) => normalizeTypeValue(value, vocabulary))
			.filter((value) => {
				if (taken.has(value.toLowerCase())) return false;
				taken.add(value.toLowerCase());
				return true;
			});
		if (added.length > 0) onChange([...values, ...added]);
		setDraft('');
	}

	return (
		<div className={styles.group}>
			<span className={styles.groupLabel}>{label}</span>
			{values.map((value) => (
				<span key={value} className={styles.tag}>
					{value}
					<button
						type="button"
						onClick={() => onChange(values.filter((entry) => entry !== value))}
						aria-label={`${label} — ${value}`}
					>
						<X size={11} weight="bold" />
					</button>
				</span>
			))}
			<div className={styles.inputWrapper}>
				<input
					value={draft}
					onChange={(event) => {
						// La virgule valide immédiatement : coller « Human, Wizard »
						// produit deux tags sans passer par Entrée.
						if (event.target.value.includes(',')) commit(event.target.value);
						else setDraft(event.target.value);
					}}
					onKeyDown={(event) => {
						if (event.key === 'Enter') {
							event.preventDefault();
							commit(draft);
						}
						// Retour arrière sur un champ vide : retire le dernier tag, le
						// raccourci attendu de ce type de champ.
						if (event.key === 'Backspace' && !draft && values.length > 0) {
							onChange(values.slice(0, -1));
						}
					}}
					onBlur={() => commit(draft)}
					// Placeholder seulement tant que la liste est vide : avec des tags il
					// passe à la ligne et déséquilibre la rangée, alors qu'il n'apprend
					// plus rien à ce stade.
					placeholder={values.length === 0 ? placeholder : ''}
					maxLength={40}
				/>
				{suggestions.length > 0 && (
					<ul className={styles.suggestions}>
						{suggestions.map((entry) => (
							<li key={entry}>
								<button type="button" onMouseDown={() => commit(entry)}>
									{entry}
								</button>
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}

/**
 * Éditeur de ligne de type.
 *
 * Remplace le champ texte libre où il fallait connaître la grammaire
 * « Legendary Creature — Human Wizard », tiret cadratin compris. L'utilisateur
 * remplit trois listes ; la ligne est composée pour lui.
 *
 * La chaîne reste la valeur stockée (c'est le format de la carte), donc le
 * composant relit la ligne existante à chaque rendu plutôt que de tenir un état
 * parallèle qui pourrait diverger.
 */
export function TypeLineField({
	typeLine,
	onChange,
	hasError,
}: {
	typeLine: string;
	onChange: (value: string) => void;
	hasError?: boolean;
}) {
	const t = useTranslations('cardEditor.fields');
	const vocabulary = useCardTypeVocabulary();
	const parts = parseTypeLine(typeLine, vocabulary);

	function update(group: TypeGroup, values: string[]) {
		onChange(composeTypeLine({ ...parts, [group]: values }));
	}

	return (
		<fieldset className={`${styles.field} ${hasError ? styles.fieldError : ''}`}>
			<legend className={styles.fieldLabel}>{t('typeLine')}</legend>
			<div className={styles.groups}>
				<TypeTagInput
					label={t('supertypes')}
					placeholder={t('supertypesPlaceholder')}
					values={parts.supertypes}
					vocabulary={vocabulary?.supertypes ?? []}
					onChange={(values) => update('supertypes', values)}
				/>
				<TypeTagInput
					label={t('types')}
					placeholder={t('typesPlaceholder')}
					values={parts.types}
					vocabulary={vocabulary?.types ?? []}
					onChange={(values) => update('types', values)}
				/>
				<TypeTagInput
					label={t('subtypes')}
					placeholder={t('subtypesPlaceholder')}
					values={parts.subtypes}
					vocabulary={vocabulary?.subtypes ?? []}
					onChange={(values) => update('subtypes', values)}
				/>
			</div>
			{/*
			 * Aperçu de la ligne composée : c'est elle qui sera imprimée. Vide, on
			 * laisse le pseudo-élément CSS afficher le tiret plutôt que d'injecter
			 * un placeholder qui ressemblerait à une vraie valeur.
			 */}
			<output className={styles.preview}>{typeLine}</output>
		</fieldset>
	);
}
