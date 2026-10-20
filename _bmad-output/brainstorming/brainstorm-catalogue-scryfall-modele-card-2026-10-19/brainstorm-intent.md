# Intention : Modèle Card & fraîcheur du catalogue Scryfall

Source : brainstorm du 2026-10-19 (`.memlog.md`, même dossier), issue #29. Deux epics indépendants, menables en parallèle.

## Epic A : Modèle Card (fin de la migration `ScryfallCard` → `Card`)

État : vagues A et B faites ; 17 fichiers référencent encore `ScryfallCard`, dont certains légitimement (`lib/scryfall/*`, `lib/card/adapter.ts`).

Fin visée :

- Une règle ESLint `no-restricted-imports` interdit `ScryfallCard` hors de `lib/scryfall` et `lib/card/adapter` ; `npm run check` échoue en cas de réimport.
- `lib/mpc` et `lib/cardnexus` ont leur propre adaptateur vers `Card`.
- Le cache client IDB (`lib/scryfall/utils/card-cache.ts`) stocke des `Card` ; sa version est montée et l'ancien cache vidé proprement, sans reproduire le blanchiment d'images connu du cache localisé.
- UI 100 % `Card` : PrintList, CardPrintPickerModal, UseCollectionCopyModal, ImportPreview.

Stories, dans l'ordre :

1. [Chore] Frontière ESLint en **warn** : premier pas de l'epic, elle mesure la vraie taille de la vague.
2. Adaptateurs MPC / CardNexus vers Card.
3. Cache IDB en Card.
4. UI 100 % Card, puis la règle passe en **error**.

## Epic B : Fraîcheur du catalogue

État : catalogue prod seedé le 2026-07-25 seulement, manuellement (`seed:prod`).

Contraintes réelles : pas d'accès à Postgres prod depuis l'extérieur ; seul Jo a accès à Coolify. Levier : `seed-catalog.ts` écrit déjà via PostgREST et la clé service, donc une **GitHub Action** peut seeder la prod.

Hors périmètre : les **prix** (pas récupérés depuis Scryfall) et les langues manquantes (de/es/it/ja).

Stories :

5. Action de seed : `workflow_dispatch` + cron hebdomadaire, qui lance le seed existant (sets + catalogue) ; secrets prod dans GitHub ; un échec déclenche une alerte.
6. Seed seulement si le `updated_at` du bulk Scryfall est plus récent que le dernier seed ; date du dernier seed stockée en DB et visible dans le résumé de l'Action. `needs-migration`
7. Prints retirés par Scryfall marqués `removed_at` (jamais supprimés) : exclus de la recherche, toujours résolvables pour leurs possesseurs. `needs-migration`
8. Remappage des données utilisateur via `/migrations` de Scryfall, **dans l'Action** après le seed : un merge réécrit `card_entries.scryfall_id` vers le nouvel id. Garde-fous : journal des migrations appliquées (chacune une seule fois, ancien id conservé pour pouvoir revenir en arrière) et `backup:prod` en artefact avant. **Cet artefact contient des données personnelles : rétention courte (1 à 3 jours) ou chiffrement.** `needs-migration`
9. Vraies images png dans le seed (aujourd'hui, le palier png est dérivé de large). L'issue #7 y est rattachée, mais elle peut aussi venir du choix de palier dans `CardImage` : à vérifier.

Faits utiles :

- `card_entries.scryfall_id` n'a **pas** de FK vers `card_prints` : un print supprimé laisserait des cartes orphelines.
- `/migrations` ne couvre que les changements d'id (merge/delete), environ 20 par mois, souvent propres à Arena.
- Les mises à jour d'image gardent le même id et sont couvertes par l'upsert.

## Hors de ces epics

- Epic « Studio de cartes custom » : en Backlog, sans stories (branche `feat/custom-card-studio` en pause, 145 commits non fusionnés).
- Issue #27 : rattacher #4–#7 une fois les epics créés (#7 → epic B).
