# Rework cinématique de la landing — Design

**Date :** 2026-07-20
**Statut :** Design validé, prêt pour le plan d'implémentation.

## Objectif

Réécrire entièrement la landing (`src/app/[locale]/(landing)/`) en **vitrine des outils** : chaque grande feature de l'app obtient un **écran plein-page épinglé (pinned) avec une mini-démo scénarisée qui se joue au scroll**. Le but est le « waw » et une **identité forte** ; les CTA pointent vers les outils (pas vers l'inscription). L'animation au scroll raconte le parcours d'un joueur.

Non-objectifs : conversion vers inscription, section communauté dédiée, collecte d'emails.

## Décisions transverses (verrouillées)

- **Structure :** format cinématique linéaire — Hero, puis 6 features en écrans pinés (une feature = ~1 écran), puis un CTA final. Alternance texte gauche/droite d'un écran à l'autre.
- **Réalisme des démos : semi-réel.** Vraies images de cartes Scryfall (via `scryfallImageLoader`, cf. contrainte UA cards.scryfall.io) + vrais graphiques (courbe/anneau/main en données figées) ; le chrome UI autour est **maquetté**. **Aucun vrai composant applicatif n'est monté** dans la landing.
- **Animation : les 6 sections sont pinées** (scroll-pinning / scrollytelling), en plus d'un reveal de base et d'un micro-parallax au Hero.
- **Direction visuelle : évoluer le style existant.** On garde l'or « native-gold » et le wordmark **W** (face négative validée), mais on **allège l'art-déco** : moins de cadres/ornements, plus d'espace négatif, typo plus tranchée, un seul geste fort par écran.
- **Zéro nouvelle dépendance :** pas de GSAP/Framer. Un hook maison `useScrollProgress` suffit. React Compiler est off → gestion manuelle et propre des refs.
- **i18n :** tous les textes via `next-intl`, namespace `landing.*` (en + fr). Aucune string en dur.
- **SEO :** conserver `generateMetadata` + `buildAlternates(locale)` ; la home reste `index:true`. Le contenu principal (titres, taglines) est du vrai texte, pas caché dans les démos.

## Garde-fous techniques (intégrés d'office)

- **Dégradation mobile + `prefers-reduced-motion` :** `PinnedFeature` **n'épingle pas** ; la démo est rendue en **état final statique** (`progress = 1`), scroll normal. Branche unique, testable.
- **Budget de scroll par section** (≈ 200–300vh) pour que la page ne devienne pas interminable.
- **Perf :** démos en CSS `transform`/`opacity` uniquement (pas de layout thrash) ; `dynamic()` pour les démos below-the-fold ; `sizes` corrects sur les images.

## Le pattern clé — `PinnedFeature` + `progress`

Chaque section est un bloc haut (~200–300vh) ; à l'intérieur, un conteneur `position: sticky; top: 0; height: 100vh`. `useScrollProgress` convertit le défilement **dans ce bloc** en une valeur `progress` de 0 à 1, passée à la démo.

**La démo est une fonction pure de `progress`** : à 0 rien n'est joué, à 1 l'état final. Bénéfices :

- Isolation : chaque démo est testable seule, « scrubbable » sans scroll réel (rendu à `progress` fixe 0 / 0.5 / 1).
- Le fallback mobile/reduced-motion revient à rendre `progress = 1`.
- Aucun vrai composant applicatif n'est nécessaire.

`PinnedFeature` est une **coquille générique** : sticky + calcul de progression + fallback + layout gauche/droite + slot démo. Les 6 démos sont des composants distincts recevant `progress`.

## Arborescence cible

```
(landing)/
  page.tsx                    // orchestre Hero + 6 PinnedFeature(demo) + FinalCTA + i18n
  page.module.css
  data/
    demoContent.ts            // URLs images Scryfall figées + données courbe/anneau/main + libellés démo
  hooks/
    useInView.ts              // conservé
    useScrollProgress.ts      // progression 0→1 d'un bloc piné
    useReducedMotion.ts       // détecte prefers-reduced-motion
  components/
    Hero/
    PinnedFeature/            // coquille générique (sticky, progress, fallback, layout, slot démo)
    demos/
      SearchDemo/ CollectionDemo/ DeckDemo/ ImportDemo/ PdfDemo/ EditorDemo/
    FinalCTA/
```

Suppressions (remplacés) : `components/Features`, `components/CardShowcase` (+ `showcaseData.ts`), `components/CallToAction`, `components/Hero/backdrops/*` (les 6 backdrops + `RandomBackdrop`). Le nouveau Hero garde l'esprit (or, W, ornement diamant) mais épuré.

## Hero (plein écran)

- Fond : crosshatch fixe existant, **estompé** derrière le Hero (dégradé radial vers le centre) pour laisser respirer le wordmark. Il **réapparaîtra net** au FinalCTA (boucle).
- **W en négatif** (bloc or + W creusé) grand, centré-gauche, ancre de marque. « WIZCARD » en dessous en wordmark décoratif (pattern brand-font actuel conservé).
- Tagline tranchée (une ligne) + phrase de description. i18n.
- **Un seul CTA principal** « Explorer » → `/search` ; lien secondaire discret « Ma collection » → `/collection` (hiérarchisé, on resserre par rapport aux deux gros boutons actuels).
- Indice de scroll animé (diamant + ligne) qui lance la cinématique.
- **Micro-parallax** léger (W et fond à vitesses différentes) ; dégradé si reduced-motion.

Abandonné du Hero actuel : les 4 cadres art-déco d'angle et le `RandomBackdrop` géométrique aléatoire.

## Les 6 écrans de features

Layout commun : moitié texte (label doré « 01 — Recherche » + titre + 1–2 phrases + lien « Découvrir » optionnel vers la route réelle) / moitié démo. Alternance gauche/droite. Le texte fait un reveal ; la démo suit `progress`.

L'ordre suit un **fil narratif** : chercher (1) → posséder & synchroniser (2) → construire & analyser (3) → importer l'existant (4) → exporter en planches (5) → bientôt créer ses cartes (6).

Découpage `progress` (0→1) par démo :

1. **SearchDemo** — 0–0.3 la requête « Lightning Bolt » se tape (largeur ∝ progress) ; 0.3–0.4 le filtre couleur **R** s'allume ; 0.4–0.7 trois vraies cartes tombent en cascade (translateY + opacity staggerés) ; 0.7–1 une carte se soulève (tilt) et s'agrandit en aperçu détail. Sous-titre : « cartes · decks · joueurs, une seule barre ». Lien → `/search`.

2. **CollectionDemo** — 0–0.4 la grille se remplit ; 0.3–0.6 compteur **0 → 1 248** (interpolé) ; 0.5–0.75 une carte bascule wishlist → possédée (check doré) ; 0.75–1 pictos téléphone + laptop reliés par un trait qui se trace, même carte des deux côtés. Lien → `/collection`.

3. **DeckDemo** — 0–0.3 les cartes s'empilent ; 0.3–0.6 la courbe de mana se dessine barre par barre ; 0.5–0.75 l'anneau de couleurs se remplit (conic-gradient) ; 0.75–1 la main de 7 cartes se déploie en éventail. Lien → `/decks`.

4. **ImportDemo** — 0–0.4 les 4 logos (Moxfield, MTGA, CardNexus, Delver Lens) tombent vers une zone « coller » ; 0.4–0.7 un bloc de texte collé se résout en vraies cartes ; 0.7–1 barre de progression + « 60 cartes reconnues ». Lien → point d'entrée import (`/collection`).

5. **PdfDemo** — 0–0.5 les cartes se rangent en planche 3×3 ; 0.5–0.8 la feuille se replie / sort en PDF ; 0.8–1 badge « prêt à imprimer · format proxy ». Lien → route PDF si elle existe (sinon pas de lien).

6. **EditorDemo (COMING SOON)** — traitement **teaser** volontairement moins fini : 0–0.4 cadre de carte vierge qui se trace ; 0.4–0.8 titre + zone d'illustration + texte en fantôme ; 0.8–1 **tampon doré « Bientôt »**. Badge _Soon_ sur le label. **Aucun lien** de route (feature inexistante). **Pas de champ « prévenez-moi »** en v1 (YAGNI).

**Assets (`data/demoContent.ts`) :** poignée d'URLs d'images Scryfall figées (cartes iconiques) + données courbe/anneau/main en dur. Rien n'est fetché au runtime → rendu déterministe, aucune dépendance réseau.

## FinalCTA (dernier plein écran)

- Retour de la marque / du **W** en écho au Hero (boucle visuelle).
- Phrase de conclusion (i18n) + **CTA principal** « Commencer » → `/search` ; lien secondaire « Voir les decks publics » → `/decks` (ancre communauté légère).
- Crosshatch qui **réapparaît net** (sensation d'arrivée).
- Ornement diamant de clôture. Reveal simple, pas de pin.

**Hors scope v1 :** progress-rail vertical (6 points dorés indiquant l'avancement) — polish ajoutable après.

## Testing & vérification

Pas de framework de test (vitest/jest absents). Vérification par :

- `npm run check` propre **sur les fichiers touchés** (gate « pas de NOUVEAU problème » ; baseline ~60 problèmes préexistants ailleurs).
- Runtime `npm run dev` : desktop (les 6 démos se jouent au scroll), mobile (pas de pin, états finaux statiques), `prefers-reduced-motion` forcé (idem statique).
- Testabilité par design : rendre chaque démo à `progress` fixe (0 / 0.5 / 1) sans scroll réel.

## i18n / SEO

- Namespace `landing.*` réécrit dans `en.json` + `fr.json` (hero ; 6 features × {label, title, description, lien} ; finalCta ; badges). **Purge** des clés `landing.features` / `landing.showcase` orphelines.
- `generateMetadata` + `buildAlternates(locale)` conservés ; home `index:true`.

## Ordre d'implémentation

1. Hooks `useScrollProgress` + `useReducedMotion` + coquille `PinnedFeature` (fallback mobile/reduced-motion inclus).
2. `data/demoContent.ts` (URLs Scryfall figées + données graphiques).
3. Hero évolué (W négatif, art-déco allégé, micro-parallax).
4. Les 6 démos, une par une (Search → Collection → Deck → Import → PDF → Editor).
5. FinalCTA.
6. `page.tsx` d'orchestration + i18n en/fr.
7. Suppression des anciens composants (Features, CardShowcase, CallToAction, backdrops, showcaseData) + purge des clés i18n.
8. `npm run check` + passes runtime (desktop / mobile / reduced-motion).
