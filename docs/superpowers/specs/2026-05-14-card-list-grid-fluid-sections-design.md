# Design Spec — CardListGrid Fluid Sections

**Date:** 2026-05-14  
**Status:** Approved

## Context

Actuellement, chaque section du `CardListGrid` (ex: Mainboard, Sideboard, Creatures, Instants…) prend toute la largeur disponible et s'empile verticalement. Pour les decks avec plusieurs petites sections (ex: Sideboard de 7 cartes, Commander de 1 carte), l'espace est gaspillé et la lisibilité est réduite.

L'objectif est de permettre aux sections de s'afficher côte à côte en adaptant leur largeur à leur contenu naturel (le grid de cartes a une taille définie → le browser fit le container).

## Comportement souhaité

- Les sections s'affichent côte à côte si elles tiennent sur la ligne
- La largeur de chaque section est déterminée par son contenu (fit-content) — pas de calcul JS proportionnel
- Les sous-sections (depth > 0) ont le même comportement entre elles
- Si une section est trop large, elle passe à la ligne suivante (flex-wrap)
- Comportement opt-in via une prop `fluidSections` — pas activé par défaut

## Activation

La prop `fluidSections` est ajoutée à :

- `CardListGridProps` (niveau bas)
- `CardListProps` (niveau wrapper — passée en transparence à CardListGrid)

**Activé dans :**

- `src/app/decks/[id]/page.tsx`
- `src/lib/card/components/CardModal/CardModal.tsx`

## Architecture CSS

### Conteneur des sections top-level (quand `fluidSections`)

```css
.fluidSectionsContainer {
	display: flex;
	flex-wrap: wrap;
	gap: 24px;
	align-items: flex-start; /* sections ne s'étirent pas en hauteur */
}
```

### Chaque section flex item

```css
.fluidSection {
	flex: 0 0 fit-content; /* pas de grow/shrink, largeur = contenu */
	min-width: 200px; /* évite une section trop étroite */
	max-width: 100%; /* ne dépasse jamais le conteneur */
}
```

Le grid interne (`.grid` avec `auto-fill minmax(200px, 1fr)`) conserve son comportement actuel. Avec `fit-content` sur la section, il prend sa largeur naturelle minimale.

### Sous-sections

Le même pattern s'applique dans `.sectionBody` quand la section parent est en mode fluid — le `sectionBody` devient aussi un flex wrap.

## Fichiers à modifier

| Fichier                                                        | Changement                                             |
| -------------------------------------------------------------- | ------------------------------------------------------ |
| `src/lib/card/components/CardListGrid/CardListGrid.types.ts`   | Ajouter `fluidSections?: boolean`                      |
| `src/lib/card/components/CardListGrid/CardListGrid.tsx`        | Wrapper conditionnel sur sections + sectionBody        |
| `src/lib/card/components/CardListGrid/CardListGrid.module.css` | Ajouter `.fluidSectionsContainer`, `.fluidSection`     |
| `src/lib/card/components/CardList/CardList.types.ts`           | Ajouter `fluidSections?: boolean` dans `CardListProps` |
| `src/lib/card/components/CardList/CardList.tsx`                | Passer `fluidSections` à `CardListGrid`                |
| `src/app/decks/[id]/page.tsx`                                  | Passer `fluidSections` au `CardList`                   |
| `src/lib/card/components/CardModal/CardModal.tsx`              | Passer `fluidSections` au `CardList`                   |

## Vérification

1. Deck view avec sections (Mainboard + Sideboard + Commander) → les petites sections se placent côte à côte
2. Sous-sections (Creatures, Instants…) → s'affichent aussi côte à côte
3. Sections collapsées → comportement inchangé
4. Vue sans `fluidSections` (search, collection) → comportement inchangé (empilement vertical)
5. Mobile → flex-wrap gère le passage à la ligne naturellement
