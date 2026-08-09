'use client';

import { forwardRef, useId, useRef, type CSSProperties, type PointerEvent } from 'react';
import { artPanBounds, clampOffset } from '@/lib/card-editor/art-pan';
import { FLAVOR_ITALIC_FAMILY, GENERIC_SANS, GENERIC_SERIF } from '@/lib/card-editor/fonts';
import {
	frameCarriesOwnArtWindow,
	type MseTemplate,
	type MseTextColors,
} from '@/lib/card-editor/mse-assets';
import { templateGeometry } from '@/lib/card-editor/template-geometry';
import {
	expandCardNameShortcut,
	fitTitle,
	getManaSymbols,
	getRulesFontSize,
	manaSymbolProxyUrl,
	measureText,
	RULES_SYMBOL_SIZE_RATIO,
	splitRulesSegments,
	wrapCardText,
} from '@/lib/card-editor/text-layout';
import {
	CARD_FIELD_MAX_LENGTH,
	type CardArtworkDraft,
	type CardCanvasLabels,
	type CardFaceDraft,
	type CardFinish,
	type CardLayoutId,
	type CardRarity,
	type CardRect,
	type CardTextFont,
	type EditableCardField,
} from '@/lib/card-editor/types';
import { useScryfallSymbols } from '@/lib/scryfall/hooks/useScryfallSymbols';
import type { ScryfallCardSymbol } from '@/lib/scryfall/types/scryfall';
import styles from './CardCanvas.module.css';

interface CardCanvasProps {
	face: CardFaceDraft;
	layoutId: CardLayoutId;
	rarity: CardRarity;
	finish: CardFinish;
	setCode: string;
	collectorNumber: string;
	mseFramePath?: string | null;
	mseBlend?: { base: string; overlay: string; mask: string; plate: string } | null;
	mseCrownPath?: string | null;
	mseTextColors?: MseTextColors | null;
	mseTemplate?: MseTemplate;
	labels: CardCanvasLabels;
	onFieldChange: (field: EditableCardField, value: string) => void;
	onArtworkChange: (artwork: CardArtworkDraft) => void;
	isInteractive?: boolean;
}

/**
 * Encre par défaut du titre et de la ligne de type.
 *
 * Chaque gabarit déclare ses propres couleurs de texte (`mseTextColors`), lues
 * du corpus MSE : c'est le chemin normal. Cette valeur ne sert qu'aux gabarits
 * dont le corpus ne déclare rien — un quasi-noir, lisible sur les barres claires
 * de la très grande majorité des cadres.
 *
 * Ce n'est pas un repli de géométrie (interdits par la règle « aucun fallback »),
 * seulement une couleur de dernier recours : sans elle le texte serait invisible.
 */
const DEFAULT_INK = '#17140d';

/**
 * Encre d'un champ : la couleur MESURÉE d'abord, l'ingérée ensuite.
 *
 * `frame_text_colors` porte la MÊME valeur (`#17140d`) pour les 140 gabarits :
 * c'est une constante d'ingestion, pas une mesure. Le corpus, lui, déclare une
 * couleur par champ sur 132 d'entre eux, et elle diffère vraiment — `magic-old`
 * écrit son titre en blanc, `magic-extended-art` son texte de règles en blanc
 * sur ombre noire. Les peindre en sombre les rendait illisibles.
 *
 * L'ordre est donc « mesuré > ingéré > constante », la même hiérarchie que la
 * géométrie et les polices.
 */
function inkFor(font: CardTextFont | undefined, ingested: string | undefined): string {
	return font?.color ?? ingested ?? DEFAULT_INK;
}

/**
 * Ombre portée d'un champ, au format `filter` SVG.
 *
 * MSE dessine le texte deux fois : l'ombre décalée, puis le texte. On utilise
 * `drop-shadow` plutôt qu'un second <text>, pour que l'ombre suive exactement
 * les glyphes RÉELLEMENT rendus — y compris quand le titre est rétréci pour
 * tenir dans sa boîte, ou quand la ligne de règles intercale des symboles de
 * mana en <image>.
 *
 * Le flou est nul : MSE pose une copie nette, pas un halo.
 */
function shadowFilter(font: CardTextFont | undefined): string | undefined {
	const shadow = font?.shadow;
	if (!shadow) return undefined;
	return `drop-shadow(${shadow.dx}px ${shadow.dy}px 0 ${shadow.color})`;
}

/**
 * Cadrage du `<svg>` tant qu'aucun gabarit n'est résolu.
 *
 * Uniquement les dimensions : le rendu, lui, est vide (CardSvg sort tôt). Ce
 * n'est donc pas une géométrie d'emprunt — aucune zone de texte n'en est
 * déduite — mais le format 63 × 88 mm, pour que le conteneur garde le bon ratio
 * pendant le chargement du catalogue au lieu de sauter à l'apparition du cadre.
 */
const PLACEHOLDER_VIEWBOX = { width: 744, height: 1039 };

/**
 * Position d'un champ texte : mesurée si le corpus la donne, décalage
 * historique sinon.
 *
 * MSE ancre le texte dans sa boîte (`alignment:` + `padding:`) ; le canvas
 * posait des constantes calibrées sur un seul gabarit, et 125 des 136 cadres
 * mesurés débordaient de leur boîte de ligne de type, jusqu'à 17.6 px.
 *
 * Les valeurs de repli sont les anciennes constantes, conservées telles quelles
 * pour les rares champs sans ancrage ni métriques : elles ne sont pas justes,
 * mais elles sont ce que le studio affichait déjà, donc aucune régression.
 */
function textPosition(
	rect: CardRect,
	font: CardTextFont | undefined,
	fallback: { dx: number; dy: number }
): { x: number; y: number } {
	return {
		x: font?.left ?? rect.x + fallback.dx,
		y: font?.baseline ?? rect.y + fallback.dy,
	};
}

function rectStyle(rect: CardRect, width: number, height: number): CSSProperties {
	return {
		insetInlineStart: `${(rect.x / width) * 100}%`,
		top: `${(rect.y / height) * 100}%`,
		width: `${(rect.width / width) * 100}%`,
		height: `${(rect.height / height) * 100}%`,
	};
}

/** Dimensions des symboles de mana, partagées avec le calcul de largeur du titre. */
const MANA_SYMBOL_SIZE = 34;
const MANA_SYMBOL_GAP = 3;
/** Gouttière entre la fin du titre et le premier symbole de mana. */
const TITLE_MANA_GUTTER = 12;

/** Largeur occupée par un coût de n symboles, gouttières comprises. */
function manaCostWidth(symbolCount: number): number {
	if (symbolCount === 0) return 0;
	return symbolCount * MANA_SYMBOL_SIZE + (symbolCount - 1) * MANA_SYMBOL_GAP;
}

/**
 * Coût de mana rendu avec les SVG officiels de Scryfall.
 *
 * Le dessin maison précédent (cercle coloré + lettre) ne ressemblait pas aux
 * vrais symboles : ni hybrides, ni phyrexians, ni Tap, et les couleurs étaient
 * approximatives. On s'appuie donc sur symbolMap, déjà utilisé partout ailleurs
 * dans l'app (SymbolText / ManaSymbol).
 *
 * Les <image href> passent par /api/scryfall/symbol/<code> et NON par
 * svgs.scryfall.io en direct : ce CDN ne renvoie pas d'en-tête CORS. L'affichage
 * fonctionnerait quand même, mais l'export PNG doit LIRE ces SVG pour les
 * inliner en data-URI (cf. inlineSvgImages dans card-editor/export) et son
 * `fetch` échouerait, faisant planter tout l'export.
 *
 * Repli : un symbole absent de la map (map pas encore chargée, ou saisie libre
 * comme {ABC}) retombe sur un jeton neutre lisible plutôt que de disparaître.
 */
function ManaSymbols({
	manaCost,
	x,
	y,
	width,
}: {
	manaCost: string;
	x: number;
	y: number;
	width: number;
}) {
	// Le store Scryfall dédoublonne la requête /symbology et la met en cache :
	// appeler le hook ici plutôt que de forer la prop à travers tout le canvas
	// n'entraîne pas de fetch supplémentaire.
	const symbolMap = useScryfallSymbols();
	const symbols = getManaSymbols(manaCost);
	const size = MANA_SYMBOL_SIZE;
	const gap = MANA_SYMBOL_GAP;
	const totalWidth = manaCostWidth(symbols.length);
	const startX = x + width - totalWidth;
	return (
		<g>
			{symbols.map((symbol, index) => {
				const left = startX + index * (size + gap);
				const svgUri = manaSymbolProxyUrl(symbolMap[`{${symbol}}`]?.svg_uri);
				if (!svgUri) {
					return (
						<g key={`${symbol}-${index}`}>
							<circle
								cx={left + size / 2}
								cy={y + 26}
								r={size / 2}
								fill="#d7d8d2"
								stroke="#171412"
								strokeWidth="2.4"
							/>
							<text
								x={left + size / 2}
								y={y + 32}
								textAnchor="middle"
								fontFamily="Arial, sans-serif"
								fontSize={symbol.length > 1 ? 13 : 18}
								fontWeight="800"
								fill="#141414"
							>
								{symbol}
							</text>
						</g>
					);
				}
				return (
					<image
						key={`${symbol}-${index}`}
						href={svgUri}
						x={left}
						y={y + 26 - size / 2}
						width={size}
						height={size}
					/>
				);
			})}
		</g>
	);
}

/**
 * Une ligne de texte de règles, symboles dessinés plutôt qu'écrits.
 *
 * Une vraie carte n'imprime pas « {T} : ajoutez {G} » : elle dessine les
 * symboles. On découpe donc la ligne en segments et on avance manuellement le
 * curseur horizontal — un <text> monolithique ne permet pas d'intercaler des
 * <image>.
 *
 * Les symboles sont posés sur la ligne de base optique (décalés vers le haut
 * d'environ 0.78 × leur taille) pour s'aligner sur la hauteur d'x du texte.
 */
function RulesLine({
	line,
	x,
	y,
	fontSize,
	textColor,
	symbolMap,
	fontFamily,
	isItalic = false,
}: {
	line: string;
	x: number;
	y: number;
	fontSize: number;
	textColor: string;
	symbolMap: Record<string, ScryfallCardSymbol>;
	/** Police mesurée du gabarit ; pile générique à défaut. */
	fontFamily: string;
	/** Le texte d'ambiance est en italique ; les symboles, eux, restent droits. */
	isItalic?: boolean;
}) {
	const symbolSize = fontSize * RULES_SYMBOL_SIZE_RATIO;
	// Positions calculées en amont : le rendu ne peut pas muter un curseur dans
	// map() (react-hooks/immutability), et l'avance dépend du segment précédent.
	// `false` : le texte de règles est en Georgia NORMAL, pas gras comme le titre
	// sur lequel la table de glyphes est calibrée.
	const advance = (segment: ReturnType<typeof splitRulesSegments>[number]) =>
		segment.kind === 'symbol' ? symbolSize : measureText(segment.value, fontSize, false);

	const placed = splitRulesSegments(line).reduce<
		Array<{ segment: ReturnType<typeof splitRulesSegments>[number]; at: number }>
	>((result, segment) => {
		const previous = result.at(-1);
		const start = previous ? previous.at + advance(previous.segment) : x;
		if (segment.kind === 'symbol') return [...result, { segment, at: start }];
		// SVG SUPPRIME les espaces en tête d'un <text> au rendu (vérifié : « coule »
		// et «  coule » mesurent pareil), alors que notre calcul les compte. Sans
		// correction, le mot qui suit un symbole se colle à lui. On avance donc le
		// curseur de ces espaces et on les retire du texte effectivement rendu.
		const leading = /^\s*/.exec(segment.value)?.[0] ?? '';
		const trimmed = segment.value.slice(leading.length);
		return [
			...result,
			{
				segment: { kind: 'text', value: trimmed },
				at: start + measureText(leading, fontSize, false),
			},
		];
	}, []);

	return (
		<>
			{placed.map(({ segment, at }, index) => {
				const uri =
					segment.kind === 'symbol'
						? manaSymbolProxyUrl(symbolMap[`{${segment.code}}`]?.svg_uri)
						: null;
				// Texte, ou symbole inconnu ({ABC}, map pas encore chargée) : on garde
				// la forme brute plutôt que de laisser un trou dans la phrase.
				if (!uri) {
					return (
						<text
							key={index}
							x={at}
							y={y}
							// Ambiance : la VRAIE fonte italique du corpus
							// (MPlantin-Italic, déclarée par `swap_fonts_body_default`)
							// plutôt qu'un `font-style: italic` synthétique, que le
							// navigateur obtient en penchant les glyphes droits.
							fontFamily={isItalic ? FLAVOR_ITALIC_FAMILY : fontFamily}
							fontSize={fontSize}
							fill={textColor}
						>
							{segment.value}
						</text>
					);
				}
				return (
					<image
						key={index}
						href={uri}
						x={at}
						y={y - symbolSize * 0.78}
						width={symbolSize}
						height={symbolSize}
					/>
				);
			})}
		</>
	);
}

function RulesText({
	face,
	rect,
	placeholder,
	isNarrow,
	textColor,
	textShadow,
	fontFamily,
	textLeft,
}: {
	face: CardFaceDraft;
	rect: CardRect;
	placeholder: string;
	isNarrow: boolean;
	textColor: string;
	/**
	 * Ombre portée mesurée, en `filter` SVG. Les cadres sans panneau de règles
	 * (`magic-extended-art`) écrivent en blanc ombré à même l'illustration.
	 */
	textShadow?: string;
	/** Police mesurée du gabarit (MPlantin dans la quasi-totalité du corpus). */
	fontFamily: string;
	/** Bord gauche mesuré (marge intérieure du corpus), `rect.x + 24` en repli. */
	textLeft: number;
}) {
	const symbolMap = useScryfallSymbols();
	const oracle = expandCardNameShortcut(face.oracleText, face.name);
	const content = oracle || placeholder;
	const fontSize = getRulesFontSize(oracle.length + face.flavorText.length, isNarrow);
	// L'ambiance est légèrement plus petite que les règles, comme sur une carte.
	const flavorFontSize = Math.max(17, fontSize - 2);
	const lineHeight = fontSize * 1.28;
	// Largeur utile DÉRIVÉE du bord gauche effectif : le `- 44` d'origine valait
	// 2 × 24, les deux marges codées en dur. Le bord gauche venant désormais du
	// corpus, garder 44 ferait déborder les lignes des gabarits à marge étroite
	// (le corpus déclare `padding left: 6`, pas 24).
	const leftInset = textLeft - rect.x;
	const usableWidth = rect.width - leftInset * 2;
	const maxCharacters = Math.max(15, Math.floor(usableWidth / (fontSize * 0.53)));
	const maxLines = Math.max(2, Math.floor((rect.height - 46) / lineHeight));
	const lines = wrapCardText(content, maxCharacters, maxLines);
	const positionedLines = lines.reduce<Array<{ line: (typeof lines)[number]; offset: number }>>(
		(result, line) => {
			const previous = result.at(-1);
			if (!previous) return [{ line, offset: 0 }];
			const paragraphSpacing = previous.line.isParagraphEnd ? 1.28 : 1;
			const offset = previous.offset + paragraphSpacing;
			return [...result, { line, offset }];
		},
		[]
	);
	const flavorOffset = positionedLines.at(-1)?.offset ?? 0;
	return (
		/*
		 * L'ombre est portée par le GROUPE et non ligne par ligne : elle couvre
		 * ainsi le texte de règles, l'ambiance et les symboles de mana en <image>
		 * d'un seul filtre, exactement comme MSE ombre le champ entier.
		 */
		<g opacity={oracle ? 1 : 0.48} filter={textShadow}>
			{positionedLines.map(({ line, offset }, index) => (
				<RulesLine
					key={`${line.text}-${index}`}
					line={line.text}
					x={textLeft}
					y={rect.y + 34 + offset * lineHeight}
					fontSize={fontSize}
					textColor={textColor}
					symbolMap={symbolMap}
					fontFamily={fontFamily}
				/>
			))}
			{/*
			 * Texte d'ambiance : mêmes symboles dessinés que les règles, et surtout
			 * un vrai retour à la ligne — il était auparavant rendu d'un bloc puis
			 * tronqué à la première ligne, ce qui coupait la plupart des citations.
			 */}
			{face.flavorText &&
				flavorOffset < maxLines - 1 &&
				wrapCardText(
					face.flavorText,
					Math.floor(maxCharacters * (fontSize / flavorFontSize)),
					Math.max(1, maxLines - Math.ceil(flavorOffset) - 1)
				).map((flavorLine, index) => (
					<RulesLine
						key={`${flavorLine.text}-${index}`}
						line={flavorLine.text}
						x={textLeft}
						y={rect.y + 40 + (flavorOffset + 1.3 + index) * lineHeight}
						fontSize={flavorFontSize}
						textColor={textColor}
						symbolMap={symbolMap}
						fontFamily={fontFamily}
						isItalic
					/>
				))}
		</g>
	);
}

function Artwork({
	artwork,
	rect,
	clipId,
}: {
	artwork: CardArtworkDraft | null | undefined;
	rect: CardRect;
	clipId: string;
}) {
	// `artwork` est typé non-nul, mais il vient d'un BROUILLON RÉHYDRATÉ (
	// localStorage, ligne en base) que rien ne revalide au chargement. Un
	// brouillon écrit par une version antérieure — ou tronqué — porte un
	// `artwork` absent, et le studio tombait alors tout entier sur l'écran
	// « Une erreur est survenue », sans moyen de revenir à un état sain.
	//
	// L'absence se rend donc comme une illustration vide, qui est déjà l'état
	// prévu et réparable par l'utilisateur.
	if (!artwork?.dataUrl) {
		return (
			<g clipPath={`url(#${clipId})`}>
				<rect {...rect} fill="#111722" />
				<path
					d={`M ${rect.x} ${rect.y + rect.height * 0.7} L ${rect.x + rect.width * 0.34} ${rect.y + rect.height * 0.38} L ${rect.x + rect.width * 0.55} ${rect.y + rect.height * 0.62} L ${rect.x + rect.width * 0.78} ${rect.y + rect.height * 0.28} L ${rect.x + rect.width} ${rect.y + rect.height * 0.58} V ${rect.y + rect.height} H ${rect.x} Z`}
					fill="#263142"
				/>
				<circle
					cx={rect.x + rect.width * 0.72}
					cy={rect.y + rect.height * 0.25}
					r={rect.width * 0.09}
					fill="#c9a84c"
					opacity="0.54"
				/>
			</g>
		);
	}
	// Borné AUSSI au rendu, pas seulement pendant le glisser : réduire le zoom
	// rétrécit la marge, et un offset enregistré à un zoom plus élevé laisserait
	// alors du vide dans la carte. Le glisser et le rendu partagent la même
	// fonction, donc ils ne peuvent pas diverger.
	const bounds = artPanBounds(rect, artwork.width, artwork.height, artwork.zoom);
	const translateX = (clampOffset(artwork.offsetX, bounds.maxOffsetX) / 100) * rect.width;
	const translateY = (clampOffset(artwork.offsetY, bounds.maxOffsetY) / 100) * rect.height;

	// L'élément est dimensionné à la taille RÉELLE de l'image mise à l'échelle, et
	// c'est le `clipPath` qui découpe la fenêtre.
	//
	// Il portait auparavant `preserveAspectRatio="xMidYMid slice"` sur une boîte de
	// la taille de la fenêtre. Piège : `slice` ne fait PAS déborder l'élément — il
	// remplit la boîte et JETTE le surplus (bbox mesurée = la boîte exacte). Il n'y
	// avait donc aucune matière à faire défiler : translater ne sortait l'image du
	// champ qu'en laissant du vide derrière elle.
	//
	// Sans `width`/`height` connus, on ne peut pas calculer l'échelle : on retombe
	// sur `slice`, qui remplit correctement mais reste infaisable à déplacer — d'où
	// la marge nulle que `artPanBounds` rend dans ce cas.
	const canSize = Boolean(artwork.width && artwork.height);
	const scale = canSize
		? Math.max(rect.width / artwork.width!, rect.height / artwork.height!) * artwork.zoom
		: 1;
	const paintedWidth = canSize ? artwork.width! * scale : rect.width;
	const paintedHeight = canSize ? artwork.height! * scale : rect.height;

	return (
		<g clipPath={`url(#${clipId})`}>
			<image
				href={artwork.dataUrl}
				x={rect.x + (rect.width - paintedWidth) / 2 + translateX}
				y={rect.y + (rect.height - paintedHeight) / 2 + translateY}
				width={paintedWidth}
				height={paintedHeight}
				preserveAspectRatio={canSize ? 'none' : 'xMidYMid slice'}
			/>
		</g>
	);
}

function SetMark({ x, y, rarity }: { x: number; y: number; rarity: CardRarity }) {
	const rarityColors: Record<CardRarity, string> = {
		common: '#342f2c',
		uncommon: '#aeb7bd',
		rare: '#c9a84c',
		mythic: '#d45e30',
	};
	return (
		<g>
			<path
				d={`M ${x} ${y - 17} C ${x + 8} ${y - 9}, ${x + 14} ${y - 4}, ${x + 16} ${y} C ${x + 10} ${y + 5}, ${x + 6} ${y + 10}, ${x} ${y + 17} C ${x - 6} ${y + 10}, ${x - 10} ${y + 5}, ${x - 16} ${y} C ${x - 10} ${y - 5}, ${x - 6} ${y - 10}, ${x} ${y - 17} Z`}
				fill={rarityColors[rarity]}
				stroke="#15120f"
				strokeWidth="2"
			/>
			<circle cx={x} cy={y} r="4" fill="#f7efd9" opacity="0.72" />
		</g>
	);
}

/**
 * Le rendu ne prend PAS `layoutId` : tout ce qu'il dessine vient de la géométrie
 * mesurée du gabarit et de son PNG. Le layout ne pilotait que le cadre maison
 * (ornements, pleine illustration), qui n'existe plus.
 */
function CardSvg({
	face,
	rarity,
	finish,
	setCode,
	collectorNumber,
	mseFramePath,
	mseBlend,
	mseCrownPath,
	mseTextColors,
	mseTemplate,
	labels,
	clipId,
}: Omit<CardCanvasProps, 'onFieldChange' | 'onArtworkChange' | 'layoutId'> & { clipId: string }) {
	const geometry = templateGeometry(mseTemplate);
	// Pas de géométrie mesurée => on ne peint rien. Le studio ne propose que des
	// gabarits mesurés (cf. « aucun fallback » dans frame-choices), donc ce cas
	// ne se produit qu'en transit : catalogue en cours de chargement, ou vieux
	// brouillon pointant un cadre retiré — que CardEditorStudio répare aussitôt.
	// Emprunter des coordonnées ici est précisément le défaut que ce chantier a
	// corrigé.
	if (!geometry) return null;
	const title = face.name || labels.namePlaceholder;
	// Positions mesurées (ancrage + marge du corpus), décalages historiques en
	// repli. Cf. `textPosition`.
	const titlePosition = textPosition(geometry.title, geometry.fonts?.title, { dx: 18, dy: 39 });
	const typePosition = textPosition(geometry.typeLine, geometry.fonts?.typeLine, {
		dx: 16,
		dy: 36,
	});
	// Le titre court jusqu'au premier symbole de mana, pas jusqu'au bord de sa
	// propre zone : les symboles sont alignés à DROITE de la zone mana, donc un
	// coût court laisse beaucoup de place que le titre peut occuper.
	//
	// Soustraire manaCostWidth de la zone titre comptait la réserve deux fois
	// (les zones title et mana sont déjà adjacentes : 61+468=529 vs mana à 523)
	// et arrêtait le texte très en deçà des symboles.
	//
	// Part du bord GAUCHE effectif du titre : s'il vient du corpus, la largeur
	// disponible doit être mesurée depuis là, sinon le texte serait ajusté pour
	// une position qu'il n'occupe pas.
	const titleStart = titlePosition.x;
	const manaLeftEdge =
		geometry.mana.x + geometry.mana.width - manaCostWidth(getManaSymbols(face.manaCost).length);
	const fittedTitle = fitTitle(title, manaLeftEdge - TITLE_MANA_GUTTER - titleStart);
	const typeLine = face.typeLine || labels.typePlaceholder;
	const isNarrowRules = geometry.rules.width < 500;
	const showStats = geometry.stats.width > 0 && (face.power || face.toughness || face.loyalty);
	return (
		<>
			<defs>
				<linearGradient id={`${clipId}-foil`} x1="0" y1="0" x2="1" y2="1">
					<stop offset="0" stopColor="#70d5ff" stopOpacity="0" />
					<stop offset="0.3" stopColor="#f3a8ff" stopOpacity="0.28" />
					<stop offset="0.55" stopColor="#fff7a6" stopOpacity="0" />
					<stop offset="0.78" stopColor="#89ffc8" stopOpacity="0.24" />
					<stop offset="1" stopColor="#70d5ff" stopOpacity="0" />
				</linearGradient>
				<clipPath id={clipId}>
					<rect {...geometry.art} rx="3" />
				</clipPath>
			</defs>
			{/*
			 * Ordre de peinture : en SVG le dernier élément passe au-dessus.
			 *
			 * Un gabarit (CardConjurer/MSE) est un PNG PLEINE CARTE à fenêtre
			 * d'illustration transparente : il est donc peint APRÈS l'image, pour que
			 * ses bordures et ses ornements mordent dessus — c'est ce recouvrement qui
			 * donne une carte finie.
			 *
			 * Rien n'est dessiné SOUS l'illustration : le studio ne peint plus de cadre
			 * maison. Tant que le PNG n'est pas résolu (catalogue en cours de
			 * chargement), la carte reste volontairement nue plutôt que d'afficher un
			 * cadre de substitution — même raison que la règle « aucun fallback » sur
			 * la géométrie : une carte à moitié fausse est pire qu'une carte en attente.
			 */}
			<Artwork artwork={face.artwork} rect={geometry.art} clipId={clipId} />
			{/*
			 * Cadre hybride bicolore, composé comme MSE : trois entrées superposées.
			 * Le fond gris porte les plaques, le masque `hybrid_blend_card` découpe la
			 * bordure, et le dégradé fait passer la bordure d'une couleur à l'autre de
			 * gauche à droite. Le masque étant quasi-binaire (0,17 % de pixels
			 * intermédiaires), c'est bien le dégradé — et non lui — qui produit la
			 * transition.
			 *
			 * L'export PNG suit sans modification : `inlineSvgImages` parcourt
			 * `querySelectorAll('image')`, ce qui inclut les images DANS les <mask>.
			 * Le <linearGradient> n'est pas une image et n'a rien à inliner.
			 */}
			{/*
			 * Fenêtre d'illustration. Les cadres du corpus sont peints par-dessus
			 * l'illustration et la recouvrent : ce masque y creuse la fenêtre.
			 *
			 * Le <rect> blanc rend tout le cadre visible, le <rect> noir retire la
			 * zone d'illustration mesurée. C'est exactement ce que MSE fait pour
			 * les styles qui ne déclarent aucun masque sur leur champ image.
			 *
			 * La découpe est GÉOMÉTRIQUE pour tous les gabarits, y compris ceux
			 * qui déclarent un masque. Une version antérieure utilisait ce masque
			 * du corpus comme pochoir, à tort : dans MSE il s'applique à
			 * l'ILLUSTRATION (il lui donne sa forme), pas au cadre. C'est pourquoi
			 * 30 des 142 masques ingérés sont uniformément blancs — parfaitement
			 * normal pour une fenêtre rectangulaire, mais inutilisable comme
			 * pochoir : blanc sur blanc ne retire rien, et le cadre restait opaque
			 * au-dessus de l'illustration. `blend_masks.image` reste ingéré pour
			 * un usage futur conforme à son rôle réel.
			 *
			 * `maskUnits="userSpaceOnUse"` est explicite : le défaut
			 * `objectBoundingBox` recadrerait le masque sur la boîte de
			 * l'élément masqué au lieu de la carte.
			 */}
			<mask
				id={`${clipId}-artwin`}
				maskUnits="userSpaceOnUse"
				x="0"
				y="0"
				width={geometry.width}
				height={geometry.height}
			>
				<rect x="0" y="0" width={geometry.width} height={geometry.height} fill="white" />
				<rect
					x={geometry.art.x}
					y={geometry.art.y}
					width={geometry.art.width}
					height={geometry.art.height}
					fill="black"
				/>
			</mask>
			{mseBlend ? (
				<>
					{/*
					 * Dégradé horizontal de la première couleur vers la seconde. Les
					 * bornes 45 % / 55 % viennent de `card_hybrid_2` dans
					 * magic-m15-showcase-capenna-art-deco.mse-style, le seul style du
					 * corpus qui les déclare :
					 *   linear_blend(couleur₁, couleur₂, x1: 0.45, y1: 0, x2: 0.55, y2: 0)
					 * `y1 = y2 = 0` — la transition est horizontale, sur une bande de
					 * 10 % centrée. On garde les pourcentages : `linearGradient` est en
					 * `objectBoundingBox` par défaut, donc les bornes suivent la largeur
					 * du gabarit, les 27 cadres en paysage compris.
					 */}
					<linearGradient id={`${clipId}-hygrad`} x1="45%" y1="0%" x2="55%" y2="0%">
						<stop offset="0" stopColor="black" />
						<stop offset="1" stopColor="white" />
					</linearGradient>
					{/*
					 * `maskUnits="userSpaceOnUse"` explicite sur les deux masques : le
					 * défaut est `objectBoundingBox`, qui recadrerait le masque sur la
					 * boîte de l'élément masqué au lieu de la carte.
					 */}
					<mask
						id={`${clipId}-hygrad-mask`}
						maskUnits="userSpaceOnUse"
						x="0"
						y="0"
						width={geometry.width}
						height={geometry.height}
					>
						<rect
							x="0"
							y="0"
							width={geometry.width}
							height={geometry.height}
							fill={`url(#${clipId}-hygrad)`}
						/>
					</mask>
					<mask
						id={`${clipId}-hyplate`}
						maskUnits="userSpaceOnUse"
						x="0"
						y="0"
						width={geometry.width}
						height={geometry.height}
					>
						<image
							href={mseBlend.mask}
							x="0"
							y="0"
							width={geometry.width}
							height={geometry.height}
							preserveAspectRatio="none"
						/>
					</mask>
					{/*
					 * MSE compose `masked_blend(mask: hybrid_blend_card, light:
					 * linear_blend(c₁, c₂), dark: clcard)`. Les parties SOMBRES du masque
					 * — les plaques de titre et de ligne de type — prennent le cadre gris,
					 * ce qui donne les plaques neutres d'un hybride imprimé. Il est donc
					 * peint en fond, sans masque, et les couleurs viennent par-dessus
					 * seulement là où le masque est clair.
					 */}
					<g mask={`url(#${clipId}-artwin)`}>
						<image
							href={mseBlend.plate}
							x="0"
							y="0"
							width={geometry.width}
							height={geometry.height}
							preserveAspectRatio="none"
						/>
						<g mask={`url(#${clipId}-hyplate)`}>
							<image
								href={mseBlend.base}
								x="0"
								y="0"
								width={geometry.width}
								height={geometry.height}
								preserveAspectRatio="none"
							/>
							<image
								href={mseBlend.overlay}
								x="0"
								y="0"
								width={geometry.width}
								height={geometry.height}
								preserveAspectRatio="none"
								mask={`url(#${clipId}-hygrad-mask)`}
							/>
						</g>
					</g>
				</>
			) : (
				mseFramePath && (
					<image
						href={mseFramePath}
						x="0"
						y="0"
						width={geometry.width}
						height={geometry.height}
						preserveAspectRatio="none"
						/*
						 * Un cadre servi en PNG porte déjà sa fenêtre d'illustration dans
						 * son canal alpha : lui appliquer EN PLUS la découpe géométrique
						 * efface le cadre au lieu de l'ouvrir (cf.
						 * `frameCarriesOwnArtWindow`). Les JPEG, eux, n'ont pas d'alpha —
						 * la découpe est leur seule fenêtre et reste indispensable.
						 */
						mask={frameCarriesOwnArtWindow(mseFramePath) ? undefined : `url(#${clipId}-artwin)`}
					/>
				)
			)}
			{/*
			 * Couronne légendaire, peinte APRÈS le cadre : elle mord sur le haut de
			 * la barre de titre, c'est ce recouvrement qui fait la couronne.
			 *
			 * Même `preserveAspectRatio="none"` que le cadre — le PNG est déjà cadré
			 * aux dimensions du gabarit.
			 */}
			{mseCrownPath && (
				<image
					href={mseCrownPath}
					x="0"
					y="0"
					width={geometry.width}
					height={geometry.height}
					preserveAspectRatio="none"
				/>
			)}
			<text
				x={titlePosition.x}
				y={titlePosition.y}
				fontFamily={geometry.fonts?.title?.family ?? GENERIC_SERIF}
				fontSize={fittedTitle.fontSize}
				// La graisse vient de la POLICE (Beleren Bold, Matrix, MagicMedieval
				// sont déjà des fontes de titre) : forcer 800 par-dessus déclenchait
				// une graisse synthétique du navigateur, qui épaissit et déforme les
				// glyphes. Sans police mesurée, on garde le gras — la pile générique
				// n'a pas de graisse propre.
				fontWeight={geometry.fonts?.title ? undefined : '800'}
				fill={inkFor(geometry.fonts?.title, mseTextColors?.title)}
				filter={shadowFilter(geometry.fonts?.title)}
				opacity={face.name ? 1 : 0.46}
			>
				{fittedTitle.text}
			</text>
			<ManaSymbols
				manaCost={face.manaCost}
				x={geometry.mana.x}
				y={geometry.mana.y}
				width={geometry.mana.width}
			/>
			{/*
			 * Taille et POSITION mesurées. Le 25 en dur correspondait au 13 de
			 * magic-m15 mis à l'échelle (13 × 1039/523 ≈ 25.8), et le `+36` de ligne
			 * de base à ce même gabarit : les deux étaient justes pour lui seul.
			 */}
			<text
				x={typePosition.x}
				y={typePosition.y}
				fontFamily={geometry.fonts?.typeLine?.family ?? GENERIC_SERIF}
				fontSize={geometry.fonts?.typeLine?.size ?? 25}
				fontWeight={geometry.fonts?.typeLine ? undefined : '800'}
				fill={inkFor(geometry.fonts?.typeLine, mseTextColors?.type)}
				filter={shadowFilter(geometry.fonts?.typeLine)}
				opacity={face.typeLine ? 1 : 0.46}
			>
				{typeLine}
			</text>
			<SetMark
				x={geometry.typeLine.x + geometry.typeLine.width - 27}
				y={geometry.typeLine.y + geometry.typeLine.height / 2}
				rarity={rarity}
			/>
			<RulesText
				face={face}
				rect={geometry.rules}
				placeholder={labels.rulesPlaceholder}
				isNarrow={isNarrowRules}
				textColor={inkFor(geometry.fonts?.rules, mseTextColors?.rules ?? '#181512')}
				textShadow={shadowFilter(geometry.fonts?.rules)}
				fontFamily={geometry.fonts?.rules?.family ?? GENERIC_SERIF}
				textLeft={geometry.fonts?.rules?.left ?? geometry.rules.x + 24}
			/>
			{/*
			 * Force/endurance : le TEXTE seul. Le panneau lui-même est peint par le
			 * PNG du gabarit, à l'emplacement que `geometry.stats` a mesuré — y
			 * ajouter un rectangle le recouvrirait.
			 *
			 * La couleur vient du champ `pt` quand le style la déclare, et retombe
			 * sur celle du titre sinon — le cas des gabarits sans police `pt`
			 * mesurée (48 n'ont même pas de boîte `pt`).
			 */}
			{showStats && (
				<g>
					<text
						x={geometry.stats.x + geometry.stats.width / 2}
						// Ligne de base mesurée (le corpus déclare `middle` pour 243
						// champs `pt`) ; le 0.68 historique en repli. Le X reste centré
						// sur la boîte : c'est l'horizontale, que `textAnchor` gère.
						y={geometry.fonts?.stats?.baseline ?? geometry.stats.y + geometry.stats.height * 0.68}
						textAnchor="middle"
						fontFamily={geometry.fonts?.stats?.family ?? GENERIC_SERIF}
						fontSize={geometry.fonts?.stats?.size ?? 32}
						fontWeight={geometry.fonts?.stats ? undefined : '800'}
						fill={inkFor(geometry.fonts?.stats, mseTextColors?.title)}
						filter={shadowFilter(geometry.fonts?.stats)}
					>
						{/* Une créature a TOUJOURS deux valeurs : renseigner la force sans
						    l'endurance donne « 3 / 0 », pas « 3 / — ». Le tiret laissait
						    croire à une valeur absente, qui n'existe pas sur une carte. */}
						{face.loyalty || `${face.power || '0'} / ${face.toughness || '0'}`}
					</text>
				</g>
			)}
			{/*
			 * Pied de carte : pile générique ASSUMÉE, pas un oubli. Le corpus éclate
			 * cette ligne en champs que l'extracteur ne mesure pas (`illustrator`,
			 * `copyright line`, `card number`) — même raison que FOOTER_BOTTOM_OFFSET,
			 * qui est dérivé et non mesuré. Lui prêter la police du titre serait un
			 * emprunt, précisément ce que la règle « aucun fallback » interdit.
			 */}
			<text
				x={geometry.footer.x}
				y={geometry.footer.y + 20}
				fontFamily={GENERIC_SANS}
				fontSize="14"
				fontWeight="700"
				fill={mseTextColors?.footer ?? '#f8f1df'}
			>
				{setCode || 'WIZ'} · {collectorNumber || '001'} · {labels.artistPrefix} {face.artist || '—'}
			</text>
			<text
				x={geometry.footer.x + geometry.footer.width}
				y={geometry.footer.y + 20}
				textAnchor="end"
				fontFamily={GENERIC_SANS}
				fontSize="12"
				fontWeight="700"
				letterSpacing="2"
				fill={face.accentColor}
			>
				{labels.customMark}
			</text>
			{finish !== 'matte' && (
				<rect
					x="27"
					y="27"
					width={geometry.width - 54}
					height={geometry.height - 54}
					rx="27"
					fill={`url(#${clipId}-foil)`}
					opacity={finish === 'foil' ? 0.9 : 0.55}
					pointerEvents="none"
				/>
			)}
		</>
	);
}

function DirectEditingLayer({
	face,
	layoutId,
	mseTemplate,
	labels,
	onFieldChange,
	onArtworkChange,
}: Pick<
	CardCanvasProps,
	'face' | 'layoutId' | 'mseTemplate' | 'labels' | 'onFieldChange' | 'onArtworkChange'
>) {
	const drag = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
	// Même géométrie que CardSvg, et même sortie anticipée : les zones cliquables
	// doivent rester alignées sur ce qui est RENDU. Sans cadre mesuré, CardSvg ne
	// peint rien — poser des champs sur une carte vide les rendrait injoignables.
	const geometry = templateGeometry(mseTemplate);
	// `layoutId` ne sert plus au rendu (la géométrie vient du gabarit mesuré),
	// seulement à savoir qu'un planeswalker saisit une loyauté, pas une P/T.
	const isLoyaltyLayout = layoutId === 'planeswalker';
	if (!geometry) return null;
	// Capturé APRÈS le garde : les `function` ci-dessous sont hissées, donc le
	// narrowing de `geometry` ne les atteint pas.
	const artRect = geometry.art;
	const baseField = (field: EditableCardField) => (value: string) => onFieldChange(field, value);
	function handleArtPointerDown(event: PointerEvent<HTMLButtonElement>) {
		event.currentTarget.setPointerCapture(event.pointerId);
		drag.current = {
			x: event.clientX,
			y: event.clientY,
			offsetX: face.artwork.offsetX,
			offsetY: face.artwork.offsetY,
		};
	}
	function handleArtPointerMove(event: PointerEvent<HTMLButtonElement>) {
		if (!drag.current) return;
		// Bornes DÉRIVÉES de l'image et du zoom, pas ±50 en dur : la marge utile est
		// la part de l'image qui déborde de la boîte. Un axe sans débordement a une
		// marge nulle, et le déplacement y est donc simplement inopérant — c'est ce
		// qui empêche le vide d'entrer dans la carte.
		const bounds = artPanBounds(
			artRect,
			face.artwork.width,
			face.artwork.height,
			face.artwork.zoom
		);
		const nextX = clampOffset(
			drag.current.offsetX +
				((event.clientX - drag.current.x) / event.currentTarget.clientWidth) * 100,
			bounds.maxOffsetX
		);
		const nextY = clampOffset(
			drag.current.offsetY +
				((event.clientY - drag.current.y) / event.currentTarget.clientHeight) * 100,
			bounds.maxOffsetY
		);
		onArtworkChange({ ...face.artwork, offsetX: nextX, offsetY: nextY });
	}
	return (
		<div className={styles.editingLayer}>
			<button
				type="button"
				className={styles.artHandle}
				style={rectStyle(geometry.art, geometry.width, geometry.height)}
				aria-label={labels.panArtwork}
				onPointerDown={handleArtPointerDown}
				onPointerMove={handleArtPointerMove}
				onPointerUp={() => {
					drag.current = null;
				}}
			/>
			<input
				className={styles.directField}
				style={rectStyle(geometry.title, geometry.width, geometry.height)}
				value={face.name}
				onChange={(event) => baseField('name')(event.target.value)}
				aria-label={labels.editName}
				maxLength={CARD_FIELD_MAX_LENGTH.name}
			/>
			<input
				className={`${styles.directField} ${styles.manaField}`}
				style={rectStyle(geometry.mana, geometry.width, geometry.height)}
				value={face.manaCost}
				onChange={(event) => baseField('manaCost')(event.target.value)}
				aria-label={labels.editManaCost}
				maxLength={CARD_FIELD_MAX_LENGTH.manaCost}
			/>
			<input
				className={styles.directField}
				style={rectStyle(geometry.typeLine, geometry.width, geometry.height)}
				value={face.typeLine}
				onChange={(event) => baseField('typeLine')(event.target.value)}
				aria-label={labels.editType}
				maxLength={CARD_FIELD_MAX_LENGTH.typeLine}
			/>
			<textarea
				className={styles.directRules}
				style={rectStyle(geometry.rules, geometry.width, geometry.height)}
				value={face.oracleText}
				onChange={(event) => baseField('oracleText')(event.target.value)}
				aria-label={labels.editRules}
				maxLength={CARD_FIELD_MAX_LENGTH.oracleText}
			/>
			{geometry.stats.width > 0 && (
				<>
					<input
						className={styles.statField}
						style={{
							...rectStyle(geometry.stats, geometry.width, geometry.height),
							width: `${(geometry.stats.width / geometry.width) * 48}%`,
						}}
						value={isLoyaltyLayout ? face.loyalty : face.power}
						onChange={(event) =>
							baseField(isLoyaltyLayout ? 'loyalty' : 'power')(event.target.value)
						}
						aria-label={labels.editStats}
						maxLength={CARD_FIELD_MAX_LENGTH.power}
					/>
					{!isLoyaltyLayout && (
						<input
							className={styles.statField}
							style={{
								...rectStyle(geometry.stats, geometry.width, geometry.height),
								insetInlineStart: `${((geometry.stats.x + geometry.stats.width * 0.52) / geometry.width) * 100}%`,
								width: `${(geometry.stats.width / geometry.width) * 48}%`,
							}}
							value={face.toughness}
							onChange={(event) => baseField('toughness')(event.target.value)}
							aria-label={labels.editStats}
							maxLength={CARD_FIELD_MAX_LENGTH.toughness}
						/>
					)}
				</>
			)}
		</div>
	);
}

export const CardCanvas = forwardRef<SVGSVGElement, CardCanvasProps>(function CardCanvas(
	{
		face,
		layoutId,
		rarity,
		finish,
		setCode,
		collectorNumber,
		mseFramePath,
		mseBlend,
		mseCrownPath,
		mseTextColors,
		mseTemplate,
		labels,
		onFieldChange,
		onArtworkChange,
		isInteractive = true,
	},
	ref
) {
	// Le viewBox reflète le ratio NATIF du gabarit mesuré (27 cadres du catalogue
	// sont en paysage). Pas de gabarit résolu (catalogue en vol) : on conserve un
	// viewBox portrait standard, car le <svg> porte la ref d'export et doit
	// exister même vide — CardSvg, lui, ne peindra rien.
	const viewBox = templateGeometry(mseTemplate) ?? PLACEHOLDER_VIEWBOX;
	const orientation = viewBox.width >= viewBox.height ? 'landscape' : 'portrait';
	const clipId = `card-art-${useId().replaceAll(':', '')}`;
	return (
		<div className={styles.canvas} data-orientation={orientation}>
			<svg
				ref={ref}
				className={styles.svg}
				viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
				role="img"
				aria-label={face.name || labels.namePlaceholder}
			>
				<CardSvg
					face={face}
					rarity={rarity}
					finish={finish}
					setCode={setCode}
					collectorNumber={collectorNumber}
					mseFramePath={mseFramePath}
					mseBlend={mseBlend}
					mseCrownPath={mseCrownPath}
					mseTextColors={mseTextColors}
					mseTemplate={mseTemplate}
					labels={labels}
					clipId={clipId}
				/>
			</svg>
			{isInteractive && (
				<DirectEditingLayer
					face={face}
					layoutId={layoutId}
					mseTemplate={mseTemplate}
					labels={labels}
					onFieldChange={onFieldChange}
					onArtworkChange={onArtworkChange}
				/>
			)}
		</div>
	);
});
