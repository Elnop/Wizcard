/**
 * Traduction d'une carte du catalogue en brouillon du studio.
 *
 * Fonction PURE : ni I/O, ni DOM, ni catalogue de gabarits. C'est le cœur de
 * l'import « partir d'une carte existante », et le seul morceau qu'on peut
 * raisonner sans navigateur.
 *
 * Elle ne rapporte PAS l'illustration : `artwork.dataUrl` reste vide. L'art
 * demande un aller-retour réseau (cf. `importArtwork`), et le texte ne doit pas
 * l'attendre — ni échouer avec lui.
 */

import { clampManaCost } from './text-layout';
import { composeTypeLine, parseTypeLineWithReference, resolveTypeVocabulary } from './type-line';
import { normalizeSetCode } from './draft';
import {
	CARD_FIELD_MAX_LENGTH,
	DEFAULT_FRAME_TEMPLATE_ID,
	DRAFT_FIELD_MAX_LENGTH,
	type CardFaceDraft,
	type CardRarity,
	type CustomCardDraft,
	type EditableCardField,
} from './types';
import type { Card, CardFace } from '@/types/cards';

/**
 * Cadre du studio correspondant à l'époque de la carte source.
 *
 * Les clés sont les valeurs du champ `frame` de Scryfall, qui désigne l'époque
 * du cadre imprimé et non la mise en page (celle-ci est dans `layout`).
 *
 * Les quatre cibles sont EXACTEMENT les gabarits curés (`CURATED_FRAME_IDS`,
 * frame-choices.ts). Ce n'est pas un hasard qu'on ne puisse pas viser ailleurs :
 * l'auto-réparation de CardEditorStudio ramène au cadre par défaut tout
 * brouillon désignant un gabarit non proposé, donc un id hors liste serait
 * silencieusement annulé juste après l'import.
 *
 * C'est une approximation ASSUMÉE : quatre cadres pour trente ans d'impressions.
 * Les cadres d'une seule édition (Time Spiral, Planar Chaos) et les variantes
 * d'époque (4th, 10th) retombent sur le cadre de base de leur période.
 */
const FRAME_BY_SCRYFALL_ERA: Record<string, string> = {
	'2015': 'magic-m15',
	'2003': 'magic-new',
	'1997': 'magic-old',
	'1993': 'magic-old-abu',
};

/**
 * Mises en page qui ont un VRAI verso, c'est-à-dire deux faces physiques dos à
 * dos.
 *
 * `card_faces` ne suffit pas à décider : un `split` (Fire // Ice) et une
 * `adventure` (Bonecrusher Giant) portent eux aussi deux faces, mais ce sont
 * deux moitiés d'UNE seule face imprimée. Leur donner un verso produirait une
 * carte recto-verso qui n'existe pas, et le dos serait peint avec la moitié
 * droite de la carte.
 */
const DOUBLE_FACED_LAYOUTS = new Set([
	'transform',
	'modal_dfc',
	'double_faced_token',
	'reversible_card',
]);

/**
 * Raretés du studio. Scryfall en publie d'autres (`special` pour les cartes de
 * Time Spiral « timeshifted », `bonus` pour les Mystical Archive), qui n'ont pas
 * de symbole propre ici — on les rabat sur `rare` plutôt que d'inventer une
 * cinquième valeur que le canvas ne saurait pas dessiner.
 */
const STUDIO_RARITIES = new Set<CardRarity>(['common', 'uncommon', 'rare', 'mythic']);

function toStudioRarity(rarity: string | undefined): CardRarity {
	if (rarity && STUDIO_RARITIES.has(rarity as CardRarity)) return rarity as CardRarity;
	return 'rare';
}

/**
 * Coupe une valeur importée à la borne du champ.
 *
 * Indispensable ici, et pas seulement par prudence : les `maxLength` des
 * <input> ne bornent que la frappe (cf. le commentaire de CARD_FIELD_MAX_LENGTH).
 * Une valeur posée par programme — ce qu'est un import — les traverse sans
 * obstacle jusqu'au state, puis jusqu'en base.
 */
function boundField(field: EditableCardField, value: string | undefined): string {
	return (value ?? '').trim().slice(0, CARD_FIELD_MAX_LENGTH[field]);
}

function boundDraftField(field: keyof CustomCardDraft, value: string | undefined): string {
	const max = DRAFT_FIELD_MAX_LENGTH[field];
	const trimmed = (value ?? '').trim();
	return max === undefined ? trimmed : trimmed.slice(0, max);
}

/**
 * Une face du brouillon, à partir soit d'une face Scryfall, soit de la carte
 * elle-même quand elle n'en a qu'une.
 *
 * `printed_*` d'abord : c'est le texte de l'IMPRESSION (dans la langue du
 * print), donc ce que montre la carte qu'on a sous les yeux. `oracle_text` est
 * le texte de référence en anglais, qui reste le repli correct.
 *
 * Reprend l'apparence (`frameStyle`, `accentColor`) du brouillon courant : elle
 * appartient au style de l'utilisateur, pas à la carte source.
 */
function toFaceDraft(
	source: Card | CardFace,
	card: Card,
	appearance: Pick<CardFaceDraft, 'frameStyle' | 'accentColor' | 'blendMode'>
): CardFaceDraft {
	return {
		name: boundField('name', source.printed_name ?? source.name),
		// Borné en CARACTÈRES par boundField, puis en PIPS par clampManaCost —
		// c'est la seconde qui est la vraie contrainte du canvas.
		manaCost: clampManaCost(boundField('manaCost', source.mana_cost)),
		typeLine: boundField('typeLine', importedTypeLine(source, card)),
		oracleText: boundField('oracleText', source.printed_text ?? source.oracle_text),
		// Sur la FACE d'abord, la carte en repli. Mesuré sur 200 impressions : une
		// carte multi-face porte son ambiance PAR FACE (55 cas) et une carte simple
		// la porte sur la carte (21 cas), jamais les deux. Il n'existe pas de
		// `printed_flavor_text` : le champ est déjà dans la langue du print.
		flavorText: boundField('flavorText', source.flavor_text ?? card.flavor_text),
		power: boundField('power', source.power),
		toughness: boundField('toughness', source.toughness),
		loyalty: boundField('loyalty', source.loyalty),
		// L'artiste peut être déclaré par face (illustrations différentes au recto
		// et au verso) ; sinon celui de la carte.
		artist: boundField('artist', source.artist ?? card.artist),
		...appearance,
		artwork: {
			dataUrl: '',
			fileName: '',
			mimeType: '',
			zoom: 1,
			offsetX: 0,
			offsetY: 0,
		},
	};
}

/**
 * La ligne de type d'une face importée, ventilée puis recomposée.
 *
 * `printed_type_line` porte le texte de l'impression — donc le français sur une
 * carte française — mais l'éditeur doit pouvoir le RELIRE en trois listes. Or la
 * ponctuation imprimée varie (« Créature légendaire : time lord et soldat »
 * emploie le deux-points là où d'autres cartes mettent un cadratin), et le
 * français relie ses sous-types par « et ».
 *
 * On passe donc par l'anglais, que Scryfall livre dans le même objet : il sert
 * de grille de lecture (combien d'entrées, lesquelles sont des supertypes),
 * pendant que le texte imprimé fournit les libellés. La recomposition
 * normalise ensuite la ponctuation, pour que ce qui est stocké se relise
 * exactement comme il a été écrit.
 *
 * Sans texte imprimé — carte anglaise, ou print sans localisation — on retombe
 * sur `type_line` tel quel, qui est déjà la forme canonique.
 */
function importedTypeLine(source: Card | CardFace, card: Card): string {
	const printed = source.printed_type_line?.trim();
	const english = source.type_line?.trim() ?? '';
	if (!printed || printed === english) return english;

	// Sans vocabulaire, l'anglais n'est plus une grille de lecture : `parseTypeLine`
	// verse alors TOUT le bloc gauche dans `types`, et la recomposition soude ce
	// qu'elle croit être des types cumulés (« légendaire-Créature »). Le texte
	// imprimé brut est bien meilleur que cette normalisation à l'aveugle — il
	// reste relisible, la grammaire localisée n'ayant pas besoin du vocabulaire.
	const vocabulary = resolveTypeVocabulary();
	if (!vocabulary) return printed;

	return composeTypeLine(parseTypeLineWithReference(printed, english, card.lang, vocabulary));
}

/**
 * Le gabarit du studio à donner à cette carte.
 *
 * Exporté pour que l'appelant puisse résoudre le `layoutId` qui l'accompagne
 * dans le catalogue chargé : les deux s'écrivent ENSEMBLE (cf. `FrameChoice`),
 * et ce module pur n'a pas accès au catalogue pour le faire lui-même.
 */
export function frameTemplateForCard(card: Card): string {
	return FRAME_BY_SCRYFALL_ERA[card.frame ?? ''] ?? DEFAULT_FRAME_TEMPLATE_ID;
}

/** La face verso à importer, s'il y en a une. Seule règle de décision du recto-verso. */
function backFaceOf(card: Card): CardFace | undefined {
	return DOUBLE_FACED_LAYOUTS.has(card.layout) ? card.card_faces?.[1] : undefined;
}

/**
 * Combien de faces cet import va-t-il produire ?
 *
 * Exporté parce que l'appelant doit le savoir AVANT que le commit ne soit
 * appliqué — React diffère les mises à jour d'état, donc lire le compte dans le
 * brouillon juste après `commit` renvoie encore l'ancienne valeur.
 */
export function importedFaceCount(card: Card): 1 | 2 {
	return backFaceOf(card) ? 2 : 1;
}

/**
 * Carte du catalogue → brouillon du studio.
 *
 * `current` fournit ce qui n'appartient pas à la carte source et ne doit donc
 * pas être écrasé : le style d'apparence des faces, la finition, la visibilité,
 * les étiquettes. Tout le reste vient de la carte.
 *
 * `mseTemplateId` est posé ici mais le `layoutId` reste celui du brouillon :
 * l'appelant le corrige depuis le catalogue (cf. `frameTemplateForCard`). Les
 * laisser diverger un instant est sans conséquence — l'auto-réparation du studio
 * ramène de toute façon tout couple invalide.
 */
export function cardToDraft(card: Card, current: CustomCardDraft): CustomCardDraft {
	const appearance = {
		frameStyle: current.faces[0].frameStyle,
		accentColor: current.faces[0].accentColor,
		// Le fondu bicolore est un choix de STYLE, pas une propriété de la carte
		// source : l'import ne doit pas le réinitialiser.
		blendMode: current.faces[0].blendMode,
	};

	const front = card.card_faces?.[0] ?? card;
	const back = backFaceOf(card);
	const faces: CustomCardDraft['faces'] = back
		? [toFaceDraft(front, card, appearance), toFaceDraft(back, card, appearance)]
		: [toFaceDraft(front, card, appearance)];

	return {
		...current,
		mseTemplateId: frameTemplateForCard(card),
		faces,
		activeFace: 0,
		rarity: toStudioRarity(card.rarity),
		setName: boundDraftField('setName', card.set_name ?? card.set),
		setCode: normalizeSetCode(boundDraftField('setCode', card.set)),
		collectorNumber: boundDraftField('collectorNumber', card.collector_number),
		language: card.lang,
	};
}
