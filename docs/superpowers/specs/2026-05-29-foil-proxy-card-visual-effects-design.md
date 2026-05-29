# Foil / Proxy Card Visual Effects

**Date:** 2026-05-29
**Status:** Approved

## Context

Les cartes dans les collections et decks peuvent être marquées `isFoil` (avec `foilType: 'foil' | 'etched'`) ou `proxy` dans leur `CardEntry`. Actuellement, seuls de petits badges textuels dans `CopyCardOverlay` distinguent ces cartes. L'objectif est d'ajouter des effets visuels expressifs directement sur l'image de la carte, visibles en mode grid et partout où `CardImage` est rendu.

## Approche retenue

Modifier uniquement `CardImage` — le composant lit lui-même `card.entry?.isFoil`, `card.entry?.foilType` et `card.entry?.proxy`. Aucun appelant ne change. Un div overlay est inséré dans le wrapper image existant, clippé aux bords arrondis de la carte.

## Effets

### Foil — shimmer arc-en-ciel (hover uniquement)

- Div overlay `position: absolute; inset: 0; pointer-events: none; border-radius: inherit`
- Background : `linear-gradient` multicolore (rouge → jaune → vert → bleu → violet → rouge) à `background-size: 200% 200%`
- `mix-blend-mode: color-dodge`, `opacity: 0` au repos
- Au hover du wrapper parent : `opacity: 0.35` + animation `background-position` sur 1.2s ease-in-out
- `foilType: 'etched'` : même structure mais gradient argenté (blanc → gris clair → blanc), `opacity: 0.25`

### Proxy — filigrane texte

- Div overlay séparé, toujours visible (pas seulement au hover)
- Texte "PROXY" centré, `font-size: clamp(1.2rem, 4cqw, 2rem)`, `font-weight: 900`, `letter-spacing: 0.15em`
- `color: white`, `opacity: 0.12`, `transform: rotate(-30deg)`
- `pointer-events: none`

### Foil + Proxy combinés

Les deux overlays sont empilés. Le filigrane PROXY est toujours visible ; le shimmer foil s'active au hover par-dessus. Aucun cas spécial — les deux divs coexistent.

## Fichiers à modifier

| Fichier                                                  | Changement                                                                                                                   |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/card/components/CardImage/CardImage.tsx`        | Lire `card.entry`, rendre les overlays conditionnellement                                                                    |
| `src/lib/card/components/CardImage/CardImage.module.css` | Ajouter `.foilOverlay`, `.etchedOverlay`, `.proxyOverlay`, `@keyframes foilShimmer`, logique hover via `.imageWrapper:hover` |

`CardImage` couvre tous les points d'affichage : `CardListGrid`, `CardModal`, et tout `renderItem` / `renderOverlay`.

## Contraintes

- `card.entry` peut être absent (cartes Scryfall pures sans entrée collection) — les overlays ne s'affichent que si `entry` existe
- Les effets sont clippés à l'image (`overflow: hidden` sur le wrapper ou `border-radius: inherit` sur les overlays)
- `pointer-events: none` sur tous les overlays pour ne pas bloquer le hover/clic

## Vérification

1. Ouvrir une collection ou un deck contenant des cartes foil et/ou proxy en mode grid
2. Passer la souris sur une carte foil → shimmer arc-en-ciel visible
3. Passer la souris sur une carte foil etched → shimmer argenté visible
4. Une carte proxy → filigrane PROXY visible au repos
5. Une carte foil + proxy → filigrane au repos + shimmer au hover
6. Une carte normale → aucun effet
7. Vérifier en mode fluid-grid et dans la CardModal
8. `npm run check` passe sans erreur
