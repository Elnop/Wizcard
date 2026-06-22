# Edit card modal — synchroniser print, langue et preview

Date : 2026-06-22

## Problème

Dans `EditCardModal` (`src/lib/card/components/EditCardModal/EditCardModal.tsx`), en **edit mode**, deux comportements sont incorrects :

1. **Sélection d'un print ne met pas à jour la modale.** Le handler `onSelect` du `CardPrintPickerModal` appelle seulement `props.onChangePrint(print)` (propagation au parent). L'état local `selectedPrint` (utilisé pour la preview, ligne 140) et `entry.language` ne changent pas → la preview et la langue restent figées. Le re-montage via `key={editingCard.entry.rowId}` ne se produit pas car le `rowId` ne change pas.

2. **Changer la langue ne met pas à jour la preview.** Le `<select>` Language modifie seulement `entry.language` ; l'image (`selectedPrint`) ne reflète pas la langue choisie.

En **add mode**, la sélection de print fonctionne déjà correctement (preview + langue mises à jour).

## Décisions

- **Langue ↔ print** : sélectionner un print **écrase toujours** la langue par celle du print (cohérent avec l'add mode).
- **Langue → preview** : changer la langue dans le select **recharge l'impression localisée** correspondante (même set/numéro, autre langue) via Scryfall et met à jour la preview.
- **Langue absente (404)** : si la langue choisie n'existe pas pour ce print, **garder la preview actuelle**, **conserver la langue** dans l'entry, et **afficher un message d'info** non bloquant dans la modale.

## Architecture

Toute la logique reste dans `EditCardModal`. Pas de changement d'API parent, pas de migration DB. `onChangePrint` continue de propager l'impression choisie au parent.

Outils existants réutilisés :

- `getCardBySetNumberAndLang(setCode, collectorNumber, lang, signal)` (`src/lib/scryfall/endpoints/cards.ts`) — récupère une impression localisée.
- `LANGUAGE_TO_SCRYFALL_CODE` / `SCRYFALL_CODE_TO_LANGUAGE` (`src/lib/mtg/languages.ts`) — conversion langue MTG ↔ code Scryfall.

### Source de vérité pour le print courant

`cardForPrint` (utilisé pour ouvrir le `CardPrintPickerModal`) doit dériver de `selectedPrint` dans les deux modes, afin que le picker et les recherches localisées reflètent l'impression réellement affichée après un changement. Actuellement, en edit mode, `cardForPrint = props.card`.

## Changement 1 — Sélection d'un print (unifier edit + add)

Dans le handler `onSelect` du `CardPrintPickerModal` :

```ts
onSelect={(print) => {
  setSelectedPrint(print);                                   // preview
  const lang = print.lang ? SCRYFALL_CODE_TO_LANGUAGE[print.lang] : undefined;
  save({ language: lang });                                  // suit toujours le print
  if (!addMode) props.onChangePrint(print);                 // propage au parent
  setShowPrintPicker(false);
}}
```

## Changement 2 — Changement de langue → preview localisée

Le `onChange` du `<select>` Language :

1. `save({ language })` comme aujourd'hui.
2. Si une langue est choisie (valeur non vide) et que `selectedPrint.set` + `selectedPrint.collector_number` existent :
   - Convertir la langue MTG → code Scryfall via `LANGUAGE_TO_SCRYFALL_CODE`.
   - Annuler toute requête localisée précédente (`AbortController`).
   - Appeler `getCardBySetNumberAndLang(set, collector_number, code, signal)`.
   - **Succès** → `setSelectedPrint(localized)` ; en edit mode, `props.onChangePrint(localized)`. Effacer le message d'info éventuel.
   - **Échec / 404** → garder `selectedPrint`, conserver la langue déjà enregistrée, afficher un message d'info (ex. « Image localisée indisponible pour cette édition »).
   - Ignorer les erreurs `AbortError`.
3. Si la valeur de langue est vide (« — select — »), ne pas lancer de requête ; effacer le message d'info.

### État ajouté

- `langInfoMessage: string | null` — message d'info affiché sous le select Language.
- Un `AbortController` (ref) pour annuler les requêtes localisées obsolètes ; nettoyé au démontage.

## Portée / non-objectifs

- Pas de changement de l'API parent (`onChangePrint`, `onSave`, `onAdd`).
- Le changement 2 s'applique aussi à l'add mode (code partagé) — comportement bénéfique, pas un objectif distinct.
- Pas de cache des impressions localisées (YAGNI) ; chaque changement de langue déclenche une requête, annulée si remplacée.
- Pas de migration DB.

## Tests / vérification

- `npm run check` (TypeScript + ESLint + Prettier).
- Vérification manuelle dans la modale d'édition :
  1. Edit mode : changer de print → preview + langue se mettent à jour.
  2. Edit mode : changer la langue → preview se met à jour avec l'image localisée.
  3. Langue indisponible pour le print → preview conservée + message d'info affiché.
  4. Changements de langue rapides → pas de course (la dernière sélection gagne).
