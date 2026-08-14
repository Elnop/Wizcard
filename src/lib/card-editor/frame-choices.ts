import { CARD_LAYOUTS } from './layout-registry';
import { familyRank, frameFamily, frameOrigin, supportsCreature } from './frame-facets';
import type { MseTemplate } from './mse-assets';
import type { CardLayoutId } from './types';

/**
 * Une entrée de la liste d'apparences.
 *
 * Choisir une entrée écrit `mseTemplateId` ET `layoutId` d'un seul coup, ils ne
 * peuvent donc pas diverger — le studio a eu deux sélecteurs concurrents qui
 * s'écrasaient l'un l'autre.
 *
 * La liste ne contient QUE des cadres vendor. Les 8 gabarits « maison » dessinés
 * en SVG ont été retirés : leur rendu (panneaux flottants aux coins arrondis,
 * dégradé diagonal, texture rayée) ne tenait pas la comparaison avec les cadres
 * mesurés posés à côté d'eux dans la même grille.
 */
export interface FrameChoice {
	/** Identité stable dans la liste (clé React et cible de comparaison). */
	key: string;
	/** Famille déclarée, 2e segment du chemin MSE. Remplace `kind`. */
	family: string;
	/** Libellé affiché, déjà désambiguïsé (cf. buildFrameChoices). */
	label: string;
	layoutId: CardLayoutId;
	mseTemplateId: string;
	template: MseTemplate;
}

export interface FrameFilters {
	family: string | null;
	/** Mots-clés cumulés en ET. */
	tags: string[];
	origin: 'official' | 'custom' | null;
	orientation: 'portrait' | 'landscape' | null;
	creature: boolean | null;
}

export const DEFAULT_FRAME_FILTERS: FrameFilters = {
	family: null,
	tags: [],
	origin: null,
	orientation: null,
	creature: null,
};

/**
 * Tri : famille d'abord (la plus classique en tête), puis `position_hint`
 * croissant, puis libellé en départage.
 *
 * `position_hint` est l'ordre DÉCLARÉ par les auteurs du corpus, présent sur les
 * 109 gabarits (001-907). Le tri alphabétique d'origine l'écrasait et éclatait
 * la chronologie des cadres sur tout l'alphabet.
 *
 * Mais cet ordre est LOCAL à chaque famille, pas global : s'y fier seul plaçait
 * `space-standard` (001, un cadre Sci-Fi) et `Xerent's Space Template` (002) en
 * tête de la bibliothèque, devant le cadre M15 — et intercalait `Ultima Spells`
 * au milieu des M15. D'où le rang de famille en clé primaire (cf. `familyRank`),
 * qui remet les cadres les plus courants en premier ; `position_hint` garde son
 * rôle à l'intérieur d'une famille, là où il est fiable.
 *
 * Un `position_hint` absent passe en fin de SA famille plutôt qu'en tête : `''`
 * se trierait avant `'001'`, ce qui remonterait les gabarits non déclarés.
 */
function sortByDeclaredOrder(choices: FrameChoice[]): void {
	choices.sort((a, b) => {
		const rankDelta = familyRank(a.template) - familyRank(b.template);
		if (rankDelta !== 0) return rankDelta;
		// Même rang : familles officielles distinctes impossibles (chaque famille a
		// son rang), donc on est soit dans la même famille, soit entre deux
		// communautaires. On regroupe alors par nom de famille pour que les
		// sections restent contiguës.
		const familyDelta = a.family.localeCompare(b.family);
		if (familyDelta !== 0) return familyDelta;
		const aHint = a.template.positionHint ?? '￿';
		const bHint = b.template.positionHint ?? '￿';
		if (aHint !== bHint) return aHint.localeCompare(bHint);
		return a.label.localeCompare(b.label);
	});
}

/**
 * Désambiguïsation des noms vendor, en trois paliers successifs.
 *
 * Le catalogue est un dump : 15 noms couvrent 39 lignes, « After 8th edition »
 * apparaît 7 fois à l'identique. Tant que ces cadres vivaient derrière un onglet
 * secondaire on pouvait s'en accommoder ; ils deviennent ici le vocabulaire
 * principal, donc chaque ligne doit porter un libellé unique.
 *
 * 1. `name` seul quand il est déjà unique ;
 * 2. `name · short_name` sinon ;
 * 3. `name · short_name (id)` pour les trois paires où short_name se répète
 *    aussi (magic-textless / magic-new-textless, etc.).
 */
function disambiguateLabels(templates: MseTemplate[]): Map<string, string> {
	const nameCounts = new Map<string, number>();
	for (const template of templates) {
		nameCounts.set(template.name, (nameCounts.get(template.name) ?? 0) + 1);
	}

	const baseLabel = (template: MseTemplate): string => {
		if ((nameCounts.get(template.name) ?? 0) <= 1) return template.name;
		const short = template.shortName?.trim();
		return short ? `${template.name} · ${short}` : template.name;
	};

	const baseCounts = new Map<string, number>();
	for (const template of templates) {
		const base = baseLabel(template);
		baseCounts.set(base, (baseCounts.get(base) ?? 0) + 1);
	}

	const labels = new Map<string, string>();
	for (const template of templates) {
		const base = baseLabel(template);
		labels.set(template.id, (baseCounts.get(base) ?? 0) <= 1 ? base : `${base} (${template.id})`);
	}
	return labels;
}

/**
 * Mots-clés dont les cadres sont retirés de la bibliothèque, PROVISOIREMENT.
 *
 * Chacune de ces familles suppose une carte que le studio ne sait pas encore
 * décrire, pour l'une de trois raisons :
 *
 * - DEUX FACES là où le brouillon n'en porte qu'une : `flip`, `double_faced`.
 * - UNE BOÎTE DE TEXTE SEGMENTÉE, qu'un seul champ de règles ne peut pas
 *   remplir : `planeswalker` (capacités à loyauté), `leveler` (paliers de
 *   niveau, chacun avec ses propres P/T), `split` (deux moitiés, chacune avec
 *   son nom, son coût et ses règles).
 * - UN ÉTAT DE JEU qu'aucun champ ne porte : `tapped`, dont le cadre est dessiné
 *   incliné pour une carte engagée.
 * - PAS DE PLACE POUR LE TEXTE : `tome`/`tomes`, dont la boîte de règles MESURÉE
 *   fait 29 px de haut (contre ~200 sur un cadre normal). Le cadre est conçu
 *   pour une seule ligne ; tout texte de règles ordinaire déborde.
 * - PAS DE COÛT NI DE RÈGLES : `token`, dont la carte n'a par nature ni coût de
 *   mana ni texte de règles ordinaire. Le brouillon en porte toujours, et les
 *   peindre sur un cadre de jeton donne une carte qui n'existe pas.
 * - PAS DE BOÎTE DE TEXTE DU TOUT : `textless`, `extended_art`. Leur boîte
 *   `text` est bien MESURÉE, mais elle tombe sur l'illustration nue — le corpus
 *   la déclare pour un usage promotionnel sans règles.
 *
 * Leur géométrie est bien mesurée — ils passaient donc le filtre
 * `geometry !== null` — mais le rendu qui en sortait était faux, pas dégradé.
 *
 * L'exclusion vit en code, comme `frameOrigin` et pour la même raison : elle se
 * lève en un commit, sans migration ni passage `card-assets` (qui écrit en
 * PROD). Les lignes restent en base, intactes et toujours mesurées.
 *
 * Les mots-clés sont ceux DÉCLARÉS par le corpus, pas un motif de nom : 43 des
 * 109 gabarits que la bibliothèque proposait en portent au moins un, d'où les 66
 * restants. `flips`, `levelers` et `splits` ne sont pas listés — aucun gabarit ne
 * les porte sans porter aussi le singulier. `tomes` l'est parce que le seul
 * gabarit concerné (`magic-new-tome`) déclare les deux formes.
 */
const UNSUPPORTED_TAGS = [
	'planeswalker',
	'flip',
	'double_faced',
	'leveler',
	'split',
	'tapped',
	'tome',
	'tomes',
	'token',
	'textless',
	'extended_art',
];

/**
 * Part de la carte occupée par la fenêtre d'illustration, au-delà de laquelle le
 * gabarit est traité comme PLEINE ILLUSTRATION.
 *
 * Ce seuil n'est pas un réglage esthétique, il décrit une limite du RENDU.
 * `CardCanvas` peint le PNG du cadre PAR-DESSUS l'illustration, puis y creuse la
 * fenêtre mesurée (masque `-artwin`). Sur un cadre normal cette fenêtre est le
 * panneau d'illustration et le reste du cadre subsiste. Sur un cadre pleine
 * illustration, la fenêtre couvre presque toute la carte : le masque efface donc
 * le cadre, et il ne reste que l'illustration nue avec le texte posé dessus.
 *
 * Ces cadres supposent le modèle INVERSE — illustration au fond, cadre
 * semi-transparent par-dessus SANS découpe — que le canvas ne sait pas rendre
 * aujourd'hui. Les retirer est donc la même règle « aucun repli » que le reste
 * du studio : un cadre qu'on ne sait pas peindre juste n'est pas proposé.
 *
 * La valeur vient du corpus, pas d'un choix : mesurée sur les 40 gabarits que la
 * bibliothèque proposait, la part d'illustration se répartit en deux groupes
 * nettement séparés — les cadres ordinaires occupent 13 % à 46 %, les cadres
 * pleine illustration 59,6 % à 100 %. Le seuil est posé dans le vide entre les
 * deux, et non sur une valeur observée : aucun gabarit ne s'en approche à moins
 * de 6 points de part et d'autre, donc il ne départage aucun cas limite.
 */
const FULL_ART_AREA_RATIO = 0.55;

/**
 * Le cadre est-il pleine illustration ?
 *
 * Dérivé de la géométrie MESURÉE, jamais d'un mot-clé : les promos pleine
 * illustration du corpus (`magic-old-artbg`, `magic-new-promo`,
 * `magic-old-promo`, `magic-future-promo`) ne déclarent AUCUN mot-clé qui les
 * distingue d'un cadre ordinaire. Seule leur boîte `image` les trahit.
 *
 * Un gabarit non mesuré rend `false` : il est déjà écarté en amont par la règle
 * « aucun repli » (`geometry !== null`), et lui inventer ici un second motif
 * d'exclusion masquerait la vraie raison.
 *
 * Le correctif du masque (cf. `frameCarriesOwnArtWindow`) ne les ramène PAS, et
 * c'est vérifié plutôt que supposé. Il répare bien le CADRE des deux gabarits
 * PNG à fenêtre transparente (`magic-m15-textless`, `magic-old-promo`) : sans la
 * découpe, bordure et barre de titre survivent. Mais un échantillonnage de leur
 * canal alpha DANS leur boîte `text` mesurée donne 0 % de pixels opaques sur
 * ~2 200 points : ces cadres n'ont aucun panneau de règles, conformément à leur
 * usage promotionnel. Le texte y tomberait sur l'illustration nue — le défaut
 * même pour lequel on les écarte.
 *
 * La règle reste donc géométrique et sans exception : la pleine illustration
 * suffit à exclure.
 */
function isFullArtFrame(template: MseTemplate): boolean {
	const geometry = template.geometry;
	const image = geometry?.boxes?.image;
	if (!geometry || !image) return false;
	const cardArea = geometry.cardWidth * geometry.cardHeight;
	if (cardArea <= 0) return false;
	return (image.width * image.height) / cardArea > FULL_ART_AREA_RATIO;
}

/**
 * Part d'une barre de texte que la fenêtre d'illustration peut recouvrir.
 *
 * Même cause que `FULL_ART_AREA_RATIO`, appliquée localement : le masque
 * `-artwin` creuse la fenêtre d'illustration DANS le cadre. Quand cette fenêtre
 * mord sur la barre de nom ou sur la ligne de type, elle en efface le fond, et
 * le texte se retrouve posé sur l'illustration au lieu de son bandeau.
 *
 * C'est le défaut observé sur `magic-m15-scroll` : titre illisible sur
 * l'illustration, ligne de type flottant par-dessus.
 *
 * Le seuil est bas (5 %) parce qu'un chevauchement légitime n'existe pas : sur
 * un cadre ordinaire du corpus, l'illustration et les bandeaux sont disjoints
 * (0 % de recouvrement). Une tolérance de quelques pour cent absorbe seulement
 * les arrondis de mesure.
 */
const MAX_TEXT_BAR_OVERLAP_RATIO = 0.05;

/** Part de `box` recouverte par `window`, entre 0 et 1. */
function overlapRatio(
	window: { left: number; top: number; width: number; height: number },
	box: { left: number; top: number; width: number; height: number }
): number {
	const area = box.width * box.height;
	if (area <= 0) return 0;
	const overlapWidth = Math.max(
		0,
		Math.min(window.left + window.width, box.left + box.width) - Math.max(window.left, box.left)
	);
	const overlapHeight = Math.max(
		0,
		Math.min(window.top + window.height, box.top + box.height) - Math.max(window.top, box.top)
	);
	return (overlapWidth * overlapHeight) / area;
}

/**
 * La fenêtre d'illustration mange-t-elle une barre de texte ?
 *
 * On ne teste QUE le nom et la ligne de type, jamais la boîte de règles : sur
 * les cadres à illustration étendue légitimes, l'illustration passe derrière le
 * texte de règles sans que ce soit un défaut (le corpus les dessine ainsi), et
 * la boîte de règles des gabarits vraiment cassés est déjà rattrapée par
 * `isFullArtFrame`.
 */
function artWindowCoversTextBar(template: MseTemplate): boolean {
	const boxes = template.geometry?.boxes;
	const image = boxes?.image;
	if (!image) return false;
	return (['name', 'type'] as const).some((field) => {
		const box = boxes?.[field];
		return box ? overlapRatio(image, box) > MAX_TEXT_BAR_OVERLAP_RATIO : false;
	});
}

/**
 * La ligne de type est-elle sous la boîte de règles ?
 *
 * Sur une vraie carte Magic, la ligne de type sépare l'illustration du texte de
 * règles : elle est TOUJOURS au-dessus. Un gabarit qui l'a mesurée en dessous
 * décrit une autre mise en page (bandeau de bas de carte des cadres « extended
 * art »), où le champ `text` ne désigne pas un panneau de règles.
 *
 * Le studio y peindrait le texte de règles au milieu de l'illustration et la
 * ligne de type tout en bas — géométriquement fidèle au corpus, mais ne
 * ressemblant à aucune carte imprimée.
 *
 * Dérivé de la géométrie, pas d'un mot-clé, pour la même raison que
 * `isFullArtFrame` : c'est la mesure qui porte l'information.
 */
function hasInvertedTypeLine(template: MseTemplate): boolean {
	const boxes = template.geometry?.boxes;
	if (!boxes?.type || !boxes.text) return false;
	return boxes.type.top > boxes.text.top;
}

/**
 * Cadres proposés par la bibliothèque, désignés UN PAR UN.
 *
 * Tous les autres critères de ce fichier sont techniques : ils décrivent ce que
 * le canvas ne sait pas peindre juste (non mesuré, pleine illustration, barre de
 * texte recouverte…). Aucun ne dit si un cadre est CLASSIQUE — et le corpus ne
 * le déclare nulle part. Sans cette liste, les 27 cadres qui passaient les
 * filtres techniques arrivaient donc tous au même rang : le cadre M15 de base
 * voisinait avec `magic-new-pokemon`, `magic-sync` (Sci-Fi) et
 * `magic-new-unset-gmorph`, qui sont des curiosités et non des cadres attendus.
 *
 * La liste se limite aux cadres de BASE de chaque époque d'impression. Un cadre
 * authentique n'y suffit donc pas : les variantes d'une seule édition (4th, 10th,
 * les timeshifts) en sont écartées comme les styles d'auteur.
 *
 * L'allowlist est donc un choix ÉDITORIAL, délibérément séparé de
 * `UNSUPPORTED_TAGS` et des règles géométriques : ces dernières se lèveront
 * quand le rendu progressera, celle-ci quand on décidera d'élargir le
 * catalogue. Les confondre ferait qu'élargir la bibliothèque obligerait à
 * rouvrir des cadres que le studio peint mal.
 *
 * Une liste EXPLICITE plutôt qu'un motif (préfixe d'id, rang de famille) : les
 * variantes gardées et écartées partagent leurs préfixes (`magic-m15` est gardé,
 * `magic-m15-jinx` non) et leur famille. Tout motif trierait donc à côté, et se
 * mettrait silencieusement à rattraper de nouvelles variantes à chaque
 * enrichissement du corpus. Ici, un cadre ajouté au corpus n'apparaît jamais
 * sans décision.
 *
 * Un id absent du catalogue est sans effet — la liste est une intersection, pas
 * une garantie de présence.
 */
const CURATED_FRAME_IDS = new Set([
	// M15 — le cadre courant depuis 2014, et sa variante à boîte haute.
	//
	// `magic-m15-commander` a été retiré après examen de son image : malgré son
	// nom et sa famille `m15 style`, il ne reproduit AUCUN cadre imprimé. Il ajoute
	// au M15 un ruban dessiné par l'auteur du style ; les vraies cartes Commander
	// utilisent le cadre M15 ordinaire, leur seule marque étant le tampon
	// holographique ovale (module `stamps`, commun à tous les M15).
	//
	// Il illustre pourquoi cette liste est explicite : `frameOrigin` juge à la
	// FAMILLE, donc un style d'auteur rangé sous `m15 style` passe pour officiel.
	// Seule l'inspection de l'image le distingue — le nom du gabarit ne suffit pas.
	'magic-m15', // défaut (cf. DEFAULT_FRAME_TEMPLATE_ID)
	'magic-m15-bigtext', // même cadre, boîte de règles haute
	// Les deux époques précédentes.
	'magic-new', // 2003-2014
	'magic-old', // 1993-2003
	'magic-old-abu', // Alpha/Beta/Unlimited
	//
	// Écartés bien qu'authentiques : `magic-veryold` (4th Edition) et
	// `magic-tenth` (10th Edition), variantes d'époque que `magic-old` et
	// `magic-new` couvrent déjà à l'œil ; `magic-classicshifted` (Time Spiral) et
	// `magic-planeshifted` (Planar Chaos), qui sont des cadres d'une seule
	// édition. La bibliothèque s'en tient aux quatre cadres de base.
]);

/**
 * Ce gabarit est-il retiré de la bibliothèque ?
 *
 * Trois motifs DISTINCTS, gardés séparés parce qu'ils ne se lèveront pas en même
 * temps :
 *
 * 1. `UNSUPPORTED_TAGS` — le studio ne sait pas rendre ce cadre correctement.
 *    Se lève quand le brouillon saura décrire ces cartes.
 * 2. Origine communautaire — le cadre se rendrait bien, mais la bibliothèque ne
 *    propose que les cadres reproduisant un cadre officiel Wizards. C'est un
 *    choix de contenu, pas une limite technique.
 * 3. `CURATED_FRAME_IDS` — le cadre est officiel ET se rend bien, mais n'est pas
 *    retenu (variante cosmétique, curiosité). Choix éditorial, cf. ci-dessus.
 *
 * Attention à la portée du 2e : `frameOrigin` n'est PAS déclaré par le corpus,
 * c'est la table écrite à la main dans `frame-facets.ts`. Un gabarit sans
 * `installer_group` y tombe en « communautaire » par défaut faute de donnée, et
 * non parce qu'il l'est — `magic-testprint-8th` (« 8th Edition Test Prints ») est
 * dans ce cas. Il est retiré quand même : un cadre d'épreuve n'a pas sa place
 * dans une bibliothèque destinée aux utilisateurs.
 *
 * Exporté pour que l'auto-réparation du studio partage LE MÊME critère que la
 * liste : un brouillon resté sur un cadre exclu doit être ramené vers le cadre
 * par défaut. Sans ça il continuerait d'être peint tout en étant introuvable
 * dans le sélecteur — donc impossible à retrouver après en avoir changé.
 */
export function isUnsupportedFrame(template: MseTemplate): boolean {
	// La curation d'abord : c'est le critère le plus restrictif, et le seul qui ne
	// dépende d'aucune donnée du gabarit. Les règles suivantes restent en place
	// derrière elle — elles redeviennent décisives dès que la liste s'élargit.
	if (!CURATED_FRAME_IDS.has(template.id)) return true;
	if (frameOrigin(template) === 'custom') return true;
	if (UNSUPPORTED_TAGS.some((tag) => template.tags.includes(tag))) return true;
	// Motifs GÉOMÉTRIQUES, à garder après les mots-clés : ils rattrapent les
	// gabarits que le corpus ne mot-clé pas (cf. `isFullArtFrame`). Les deux
	// vivent dans la même fonction pour que la liste et l'auto-réparation
	// partagent exactement le même critère.
	if (isFullArtFrame(template)) return true;
	if (artWindowCoversTextBar(template)) return true;
	return hasInvertedTypeLine(template);
}

/** Construit la liste des apparences proposées : les cadres vendor mesurés. */
export function buildFrameChoices(templates: MseTemplate[]): FrameChoice[] {
	// « Aucun fallback » : un cadre sans géométrie MESURÉE n'est pas proposé.
	// Depuis le retrait des gabarits maison, cette règle décide de la totalité de
	// la liste — plus rien n'est rendu en dehors d'un cadre mesuré.
	const measured = templates.filter(
		(template) => template.geometry !== null && !isUnsupportedFrame(template)
	);
	const labels = disambiguateLabels(measured);

	const choices: FrameChoice[] = measured.map((template) => ({
		key: `mse:${template.id}`,
		family: frameFamily(template),
		label: labels.get(template.id) ?? template.name,
		layoutId: layoutForTemplate(template),
		mseTemplateId: template.id,
		template,
	}));

	sortByDeclaredOrder(choices);
	return choices;
}

/**
 * Géométrie déduite du cadre. Ne dépend pas de mse-assets (qui est un module
 * client) : ce fichier reste pur pour rester lisible et réutilisable.
 *
 * La branche `planeswalker` est INJOIGNABLE tant que `UNSUPPORTED_TAGS` la
 * retire en amont — elle est gardée telle quelle parce qu'elle redeviendra la
 * classification juste le jour où l'exclusion sera levée. La supprimer ferait
 * silencieusement tomber ces cadres en `arcana`.
 */
function layoutForTemplate(template: MseTemplate): CardLayoutId {
	if (template.layoutId && template.layoutId in CARD_LAYOUTS) return template.layoutId;
	if (template.tags.includes('planeswalker')) return 'planeswalker';
	if (template.tags.includes('token')) return 'token';
	if (template.tags.includes('saga')) return 'saga';
	return template.orientation === 'landscape' ? 'landscape' : 'arcana';
}

export function applyFrameFilters(choices: FrameChoice[], filters: FrameFilters): FrameChoice[] {
	return choices.filter((choice) => {
		if (filters.family !== null && choice.family !== filters.family) return false;
		// Mots-clés cumulés en ET : chaque mot-clé ajouté restreint.
		if (!filters.tags.every((tag) => choice.template.tags.includes(tag))) return false;
		if (filters.origin !== null && frameOrigin(choice.template) !== filters.origin) return false;
		if (filters.orientation !== null && choice.template.orientation !== filters.orientation) {
			return false;
		}
		if (filters.creature !== null && supportsCreature(choice.template) !== filters.creature) {
			return false;
		}
		return true;
	});
}

/**
 * Recherche en PRÉFIXE DE MOT, sur toutes les sources.
 *
 * Volontairement plus permissive que la classification : on cherche pendant la
 * frappe, donc « plan » doit remonter « planeswalker ». Ancrer sur le début du
 * mot suffit à écarter la collision qui a motivé ce chantier (« box » ne doit
 * pas remonter « Textbox »).
 */
export function matchesQuery(choice: FrameChoice, query: string): boolean {
	const needle = query.trim().toLocaleLowerCase();
	if (!needle) return true;
	const haystack = [
		choice.label,
		choice.template.name,
		choice.template.shortName ?? '',
		choice.template.id,
		choice.template.installerGroup ?? '',
		choice.template.tags.join(' '),
	]
		.join(' ')
		.toLocaleLowerCase();
	return haystack.split(/[^a-z0-9]+/).some((word) => word.startsWith(needle));
}

/**
 * Entrée active : le cadre dont l'id vaut `mseTemplateId` — c'est lui que le
 * canvas peint réellement, donc lui que l'utilisateur voit. `null` si le
 * brouillon pointe un cadre absent de la liste (retiré du catalogue, non mesuré,
 * ou l'ancien sentinel maison) ; CardEditorStudio le récupère alors vers le
 * cadre par défaut.
 */
export function findActiveChoice(
	choices: FrameChoice[],
	mseTemplateId: string
): FrameChoice | null {
	return choices.find((choice) => choice.mseTemplateId === mseTemplateId) ?? null;
}
