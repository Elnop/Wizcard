# MPC Ingestion Pipeline — Redesign

**Date:** 2026-06-05  
**Status:** Draft  
**Scope:** `scripts/ingest-mpc-cards.ts` + migrations Supabase

---

## Contexte et problème

Le pipeline actuel est en deux passes :

1. **Ingestion** — parse le filename, insère la carte en base avec `name = cardName` (nom du fichier, ex: `'Tis But a Scratch!'`)
2. **Enrichissement Scryfall** — après coup, cherche par `name` dans Scryfall

Ce découpage crée des erreurs silencieuses : si le `name` du fichier n'est pas le nom Oracle (nickname Godzilla, alias, nom alternatif), l'enrichissement rate sans bruit, la carte reste sans `oracle_id`, et elle n'apparaît jamais dans les listes de prints de la vraie carte.

**Exemple concret :** `'Tis But a Scratch! (Dismember).png`

- `name` ingéré = `'Tis But a Scratch!'`
- Scryfall ne connaît pas ce nom → `not_found`
- `oracle_id` reste `null`
- La carte n'apparaît pas dans la PrintsTab de Dismember

---

## Objectif

Pipeline en **une seule passe** : chaque carte arrive en base avec son `oracle_id` et son `name` Oracle correct, ou est explicitement marquée non-résolue. Aucune erreur silencieuse.

---

## Architecture

### Étape 1 — Parse du filename (inchangé)

`parseCardFilename(filename)` retourne :

- `cardName` — nom principal extrait du fichier (`'Tis But a Scratch!'`)
- `variants` — variantes extraites des parens (`["Dismember"]`)
- `bracketTags`, `setCode`, `collectorNumber`, `language`

### Étape 2 — Résolution Scryfall (nouvelle, inline)

Pour chaque fichier, avant l'upsert, on résout le nom Oracle via une fonction `resolveCard(parsed)` :

```
resolveCard(parsed):
  candidates = [cardName, ...variants.filter(v => !isMpcTag(v))]
  // ordre: nom principal d'abord, puis variants qui ne sont pas des tags MPC connus
  pour chaque candidate:
    scryfallName = normalizeName(candidate)  // "Fire & Ice" → "Fire // Ice"
    résultat = scryfallLookup(scryfallName)
    si trouvé:
      retourner { oracleName: résultat.name, oracleId: résultat.oracle_id, ...enrichment }
  retourner null  // non résolu, ingéré quand même sans oracle_id
```

**Filtrage des variants MPC avant lookup :**

La spec MPC autorise les tags dans les parens (`Image A (NSFW, Full Art).png`). Un variant qui correspond à un tag MPC connu (ex: `"Extended"`, `"Borderless"`, `"NSFW"`, `"Full Art"`, `"Showcase"`, etc.) n'est pas un nom de carte — il est exclu des candidats Scryfall. La liste des tags connus est dérivée des alias de `mpc_fil_format.txt` et maintenue dans un set statique dans le code.

**Normalisation des noms avant lookup :**

- `&` → `//` : `"Fire & Ice"` → `"Fire // Ice"` (convention Scryfall pour les cartes double-face)
- Trim des espaces superflus

**Stratégies de lookup Scryfall (dans l'ordre) :**

1. **set + collector_number** — si `setCode` et `collectorNumber` présents : `GET /cards/:set/:num` — lookup exact, prioritaire
2. **nom exact** — `POST /cards/collection` avec `{ name: candidate }` — Scryfall accepte les noms Oracle et les nicknames Godzilla
3. **nom fuzzy** — `GET /cards/named?fuzzy=candidate` — fallback si exact échoue (couvre les fautes de frappe mineures)

La stratégie fuzzy est optionnelle et peut être désactivée avec `--no-fuzzy` pour les runs rapides.

### Étape 3 — Upsert en base

Avec les données résolues :

```
name          = oracleName ?? cardName   // nom Oracle si résolu, sinon nom du fichier
raw_name      = filename original        // toujours conservé
display_name  = cardName                 // nom affiché à l'utilisateur ('Tis But a Scratch!)
oracle_id     = oracleId ?? null
enriched_at   = now() si résolu, sinon null
```

### Étape 4 — Rapport de fin

À la fin de chaque source, le pipeline imprime :

- Nombre de cartes ingérées (new / skipped / failed)
- Nombre résolues par stratégie (set+num / nom exact / fuzzy)
- **Liste explicite** des cartes non résolues avec leur filename — plus d'erreurs silencieuses

---

## Schéma DB

### Nouvelle colonne : `display_name`

```sql
ALTER TABLE custom_cards
  ADD COLUMN IF NOT EXISTS display_name text;
```

`display_name` contient le nom extrait du filename (`cardName`), affiché dans l'UI pour les cartes custom. `name` devient le nom Oracle canonique, utilisé pour les lookups et les groupements par oracle_id.

Pour les cartes sans résolution Scryfall, `display_name = name = cardName`.

### Nettoyage de la base existante

La base actuelle est droppée et reconstruite via `npm run sb:reset` + ré-ingestion complète.

---

## Gestion des types de cartes

| Type       | Résolution Scryfall                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `card`     | Complète (set+num → exact → fuzzy)                                                                                                    |
| `token`    | set+num → exact uniquement — pas de fuzzy (noms génériques comme "Goblin" ou "Human Soldier" risquent de matcher une carte non-token) |
| `cardback` | Skippée — pas de correspondance Oracle par nature                                                                                     |

---

## Throttling et performance

- La résolution est **inline** par fichier, pas en batch post-ingestion
- Concurrence limitée à `pLimit(5)` pour les sources (inchangé)
- Throttle Scryfall : 100ms entre appels (inchangé)
- La stratégie set+num est un GET unique et rapide — prioritaire pour limiter les appels nom
- La stratégie nom exact reste en batch `POST /cards/collection` par tranches de 75 pour les sources volumineuses (optimisation possible en v2)

---

## Erreurs et robustesse

- Scryfall indisponible → carte ingérée sans `oracle_id`, loggée explicitement
- Filename non parseable → carte rejetée avec log d'erreur (pas d'ingestion silencieuse)
- Drive API error → source entière skippée avec log (comportement actuel conservé)
- `--skip-scryfall` → ingestion sans résolution, toutes les cartes arrivent sans `oracle_id`

---

## Impact sur l'app

- `useMpcPrints(card.name)` recherche par `name` (Oracle) → trouve automatiquement `'Tis But a Scratch!'` quand on consulte Dismember
- `/api/mpc/index?name=Dismember` → match car `name = "Dismember"` en base
- L'UI affiche `display_name` dans la section custom card (nom du fichier/artiste)
- `oracle_id` peuplé → la carte apparaît dans PrintsTab, filtrages par couleur/CMC, etc.

---

## Hors scope

- Résolution des cartes déjà en base (base droppée, pas de backfill)
- UI de gestion des cartes non résolues
- Re-ingestion automatique planifiée
