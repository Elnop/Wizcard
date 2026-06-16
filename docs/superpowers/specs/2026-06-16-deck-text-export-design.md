# Export de decklist texte (MTGA/MTGO) depuis la page d'un deck

**Date :** 2026-06-16
**Statut :** Approuvé

## Problème

La page d'un deck permet déjà d'**importer** une decklist texte (`src/lib/import/`,
`src/lib/moxfield/`) et d'**exporter en PDF** (images, via le menu kebab du
`DeckHeader`). Il manque l'export de la **decklist en texte** au format standard MTG,
qui est le pendant naturel de l'import et permet de coller son deck dans
Moxfield / Archidekt / MTG Arena / MTGO.

## Standard de format retenu (vérifié)

Format MTGA/MTGO, accepté par Moxfield, Archidekt, ManaBox :

- **Ligne de carte** : `{qty} {Nom} ({SET}) {collectorNumber}`
  - quantité écrite `1` (pas `1x`)
  - code de set en **MAJUSCULES** (le projet le stocke en minuscules → `.toUpperCase()` à l'export)
  - set + collector number omis si absents → fallback `{qty} {Nom}`
  - C'est l'inverse exact de `RE_FULL` dans `src/lib/import/formats/mtgaCardLine.ts`.
- **Sections labellisées** par un en-tête sur sa propre ligne, séparées par une **ligne vide** :
  `Commander`, `Deck` (= mainboard), `Sideboard`, `Maybeboard`.
  Ces labels correspondent à `IGNORED_LINES` du parseur `parseMTGA` existant.
- **Ordre** : Commander → Deck → Sideboard → Maybeboard.
- **Tokens exclus** (générés automatiquement, non gérés par les outils cibles).

Note : `Maybeboard` n'est pas un label MTGA officiel mais est toléré par Moxfield/Archidekt.
On le conserve (choix produit : « tout sauf tokens »).

Sources :

- https://magicarena.fandom.com/wiki/Deck_Import
- https://draftsim.com/mtg-arena-export-deck/
- https://www.manabox.app/guides/decks/import-export/

## Architecture

Symétrique de l'import. Trois unités indépendantes.

### 1. Sérialiseur pur — `src/lib/deck/utils/serialize-decklist.ts`

```ts
serializeDecklist(cardsByZone: Record<DeckZone, ResolvedDeckCard[]>): string
```

- Pas de dépendance React → testable isolément.
- Pour chaque zone incluse (ordre Commander, mainboard, sideboard, maybeboard) :
  - regroupe les copies par carte (clé = `oracle_id ?? id`, cohérent avec le reste de la page)
    pour obtenir la quantité ;
  - préserve l'ordre de première apparition des cartes dans la zone ;
  - émet une ligne par carte : `{qty} {name} ({SET}) {collectorNumber}`,
    avec `SET = set.toUpperCase()` ; fallback `{qty} {name}` si `set` ou
    `collector_number` manquant.
- Chaque zone non vide est précédée de son en-tête de section
  (`Commander` / `Deck` / `Sideboard` / `Maybeboard`) ; les sections sont séparées
  par une ligne vide. Les zones vides sont omises (pas d'en-tête orphelin).
- Tokens jamais émis.
- Retour `''` si aucune carte (cas marginal).

Champs `ResolvedDeckCard` utilisés : `name`, `set`, `collector_number`, `oracle_id`, `id`
(champs ScryfallCard ; `entry.tags` sert au regroupement par zone via `getDeckZone`, déjà
fait en amont dans `cardsByZone`).

### 2. Modale d'export — `src/app/decks/[id]/components/DeckTextExportModal/`

`DeckTextExportModal.tsx` + `DeckTextExportModal.module.css`, suivant le pattern visuel
de `DeckPdfExportModal`.

Props :

```ts
{ text: string; deckName: string; onClose: () => void }
```

Contenu :

- `<textarea readOnly>` affichant `text` (aperçu).
- Bouton **Copier** : `navigator.clipboard.writeText(text)` ; état transitoire « Copié ✓ »
  (~2 s). En cas d'échec / API indisponible, affiche un message discret invitant à
  sélectionner-copier manuellement (le textarea reste sélectionnable).
- Bouton **Télécharger .txt** : `Blob` → `URL.createObjectURL` → `<a download>` nommé
  `${deckName}.txt` ; révoque l'URL après clic.
- Bouton **Fermer**.

### 3. Câblage

**`DeckHeader.tsx`** : nouvelle prop optionnelle `onExportText?: () => void` et nouvelle
entrée de menu kebab « ⬇ Exporter la decklist », placée à côté de « Générer un PDF ».

**`page.tsx`** :

- état `const [textExportModalOpen, setTextExportModalOpen] = useState(false)` ;
- `const decklistText = useMemo(() => serializeDecklist(cardsByZone), [cardsByZone])` ;
- passe `onExportText={() => setTextExportModalOpen(true)}` à `DeckHeader` ;
- rend `<DeckTextExportModal>` quand `textExportModalOpen` est vrai.

## Flux de données

`cardsByZone` (déjà résolu dans `page.tsx` via `useDeckDetail`)
→ `serializeDecklist` → `string`
→ `DeckTextExportModal` → presse-papiers / fichier `.txt`.

## Gestion d'erreur

- `navigator.clipboard` indisponible ou rejet de la promesse : message d'erreur discret
  dans la modale, textarea reste sélectionnable manuellement. Pas de crash.
- Decklist vide : entrée de menu cliquable, modale affiche un textarea vide. Pas de blocage.

## Tests

Test unitaire de `serializeDecklist` (`serialize-decklist.test.ts`) :

1. **Round-trip** : sérialiser une zone puis re-parser chaque ligne carte avec
   `parseMtgaCardLine` redonne `name`, `set`, `collectorNumber`, `quantity`.
2. **Regroupement des quantités** : 3 copies d'une même carte → `3 {nom} (...)`.
3. **Ordre des sections** : Commander → Deck → Sideboard → Maybeboard, séparées par
   lignes vides ; zones vides omises.
4. **Exclusion des tokens** : une carte en zone `tokens` n'apparaît jamais.
5. **Fallback name-only** : carte sans `set`/`collector_number` → `{qty} {nom}`.
6. **Casse du set** : set stocké minuscule → émis en MAJUSCULES.

## Hors périmètre (YAGNI)

- Choix de format dans la modale (un seul format : MTGA/MTGO).
- Choix de zones dans la modale (zones fixes : tout sauf tokens).
- Export Moxfield JSON, CSV, ou autres dialectes.
