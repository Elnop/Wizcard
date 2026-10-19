---
status: final
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/brainstorming/brainstorm-catalogue-scryfall-modele-card-2026-10-19/brainstorm-intent.md
---

# Wizcard - Epic Breakdown

## Overview

Ce document découpe en epics et stories implémentables la fin de la migration vers le type de domaine `Card` et la fraîcheur du catalogue Scryfall. Projet brownfield : pas de PRD ni d'architecture ; les exigences viennent du brainstorm du 2026-10-19 (issue #29).

## Requirements Inventory

### Functional Requirements

FR1: `ScryfallCard` ne peut être importé que dans `src/lib/scryfall/**` et `src/lib/card/adapter.ts` ; une règle ESLint le signale ailleurs (warn, puis error).
FR2: Les fournisseurs MPC (`src/lib/mpc`) et CardNexus (`src/lib/cardnexus`) convertissent vers `Card` par leur propre adaptateur, sans passer par `ScryfallCard`.
FR3: Le cache client IDB (`src/lib/scryfall/utils/card-cache.ts`) stocke des `Card` ; sa version est montée et les anciennes entrées sont invalidées sans laisser d'image vide.
FR4: PrintList, CardPrintPickerModal, UseCollectionCopyModal et ImportPreview ne manipulent que `Card`.
FR5: Une GitHub Action seede le catalogue prod (sets puis cartes, scripts existants), déclenchable à la main (`workflow_dispatch`) et chaque semaine (cron).
FR6: Le seed ne s'exécute que si le contenu Scryfall a changé depuis le dernier seed réussi (empreinte : liste des sets + nombre de prints, ou hash ; PAS le `updated_at` du bulk, régénéré chaque jour) ; la date et l'empreinte du dernier seed réussi sont stockées en base et affichées dans le résumé de l'Action.
FR7: Un print retiré par Scryfall est marqué `removed_at` (jamais supprimé) : exclu de la recherche, toujours résolvable pour les cartes déjà possédées. Les retraits se déduisent de `/migrations` (anciens ids des `delete` et des `merge`), sans comparer la base au bulk.
FR8: Après un seed réussi seulement, l'Action applique les migrations Scryfall (`/migrations`) aux données utilisateur, dans l'ordre de `performed_at` (fusions en chaîne) : un `merge` réécrit `card_entries.scryfall_id` vers le nouvel id. Chaque migration passe par une fonction SQL (RPC) transactionnelle qui fait la mise à jour et l'écriture au journal par ligne (`card_entry_id`, ancien id, nouvel id, migration), et n'est appliquée qu'une fois.
FR9: Le seed alimente le palier d'image png réel (aujourd'hui dérivé de `large`).

### NonFunctional Requirements

NFR1: Un échec de l'Action ouvre automatiquement une issue (l'email d'échec ne suffit pas).
NFR2: Aucune donnée utilisateur ne quitte la base : pas d'artefact de backup (dépôt PUBLIC, artefacts lisibles par tous). Le retour arrière d'un remappage passe par le journal par ligne de FR8.
NFR3: Aucun accès direct à Postgres prod : les écritures passent par PostgREST avec la clé service (comme `scripts/seed/seed-catalog.ts`).
NFR4: Toute migration SQL est idempotente, avec des GRANT explicites, et porte le label `needs-migration` : le propriétaire l'applique en prod avant le déploiement.
NFR5: `npm run check` reste vert à chaque story.
NFR6: La clé service prod est un secret d'Environment GitHub `prod` limité aux branches `main` et `deploy`, jamais un secret de dépôt.
NFR7: L'Action exécute le code de la branche `deploy` (checkout `deploy`), pour ne jamais écrire en prod avec un schéma pas encore migré ; la date et l'empreinte de seed ne sont écrites qu'en cas de succès.
NFR8: Le premier run réel mesure la durée et la mémoire du seed sur le runner GitHub (limites : 6 h, 7 Go).

### Additional Requirements

- Brownfield : réutiliser `scripts/seed/seed-sets.ts`, `scripts/seed/seed-catalog.ts`, `scripts/seed/normalize-catalog-card.ts` et `npm run backup:prod`.
- Secrets prod (URL Supabase, clé service) stockés dans les secrets GitHub ; seul Jo a accès à Coolify, donc rien n'est planifié côté Coolify.
- Hors périmètre : les prix (pas récupérés depuis Scryfall) et les langues absentes du catalogue (de/es/it/ja).
- `card_entries.scryfall_id` n'a pas de FK vers `card_prints` ; c'est la seule table utilisateur portant un `scryfall_id` (collection, wishlist et decks unifiés).

### UX Design Requirements

Aucun document UX.

### FR Coverage Map

FR1: Epic 1 - Frontière ESLint de `ScryfallCard`
FR2: Epic 1 - Adaptateurs MPC / CardNexus vers `Card`
FR3: Epic 1 - Cache IDB en `Card`
FR4: Epic 1 - UI 100 % `Card`
FR5: Epic 2 - GitHub Action de seed (manuel + hebdomadaire)
FR6: Epic 2 - Seed seulement si le contenu a changé (empreinte), date visible
FR7: Epic 2 - Prints retirés marqués `removed_at`
FR8: Epic 2 - Remappage des données utilisateur via `/migrations`
FR9: Epic 2 - Palier png réel

## Epic List

### Epic 1: Modèle Card unifié

Toutes les cartes, quel que soit leur fournisseur (Scryfall, MPC, CardNexus), circulent dans l'application sous le seul type de domaine `Card` ; `ScryfallCard` reste confiné à la couche fournisseur, et l'outillage empêche son retour. Indépendant de l'epic 2.
**FRs covered:** FR1, FR2, FR3, FR4

### Epic 2: Catalogue toujours à jour

Les joueurs trouvent les cartes et sets récents, aux images en pleine définition, sans intervention manuelle : le catalogue prod se met à jour chaque semaine, signale les prints retirés et remappe les cartes des collections concernées par une fusion Scryfall. Indépendant de l'epic 1.
**FRs covered:** FR5, FR6, FR7, FR8, FR9

## Epic 1 : Modèle Card unifié

Toutes les cartes, quel que soit leur fournisseur (Scryfall, MPC, CardNexus), circulent dans l'application sous le seul type de domaine `Card` ; `ScryfallCard` reste confiné à la couche fournisseur, et l'outillage empêche son retour.

### Story 1.1 : Frontière ScryfallCard signalée par ESLint

**En tant que** développeur,
**Je veux** qu'ESLint signale tout import de `ScryfallCard` hors de la couche fournisseur,
**Afin de** connaître la taille réelle de la migration restante et empêcher de nouveaux usages.

Couvre : FR1, NFR5.

**Critères d'acceptation :**

**Étant donné** la règle `no-restricted-imports` déjà présente dans `eslint.config.mjs`
**Quand** la restriction de `ScryfallCard` y est ajoutée en `warn`
**Alors** les restrictions existantes restent actives (fusion, pas d'écrasement)
**Et** l'import de `ScryfallCard` est autorisé seulement dans `src/lib/scryfall/**` et `src/lib/card/adapter.ts`

**Étant donné** la règle active
**Quand** `npm run check` est lancé
**Alors** il reste vert (warnings seulement)
**Et** la liste des fichiers signalés est consignée dans la PR comme périmètre des stories suivantes

**Étant donné** un fichier qui ne cite `ScryfallCard` qu'en commentaire
**Quand** la règle s'exécute
**Alors** il n'est pas signalé

### Story 1.2 : Adaptateurs MPC et CardNexus vers Card

**En tant que** développeur,
**Je veux** que les cartes MPC (`CustomCard`) et CardNexus soient décrites et converties sans dériver de `ScryfallCard`,
**Afin que** chaque fournisseur ait son propre adaptateur vers `Card`, comme Scryfall.

Couvre : FR2.

**Critères d'acceptation :**

**Étant donné** `src/lib/mpc/types.ts`
**Quand** la story est livrée
**Alors** `CustomCard` n'est plus défini à partir de `Partial<ScryfallCard>`
**Et** les champs dont l'UI a besoin restent disponibles (aucune régression d'affichage d'une carte custom)

**Étant donné** l'import et l'export CardNexus (`src/lib/cardnexus`)
**Quand** une collection est importée puis exportée
**Alors** le résultat est identique à celui d'avant la story

**Étant donné** la règle de la story 1.1
**Quand** `npm run check` est lancé
**Alors** plus aucun avertissement `ScryfallCard` ne vient de `src/lib/mpc` ni de `src/lib/cardnexus`

### Story 1.3 : Cache IDB des cartes en Card

**En tant que** joueur,
**Je veux** que le cache local des cartes passe au type `Card` sans casser l'affichage,
**Afin de** ne jamais voir d'image vide ou de squelette permanent après la mise à jour.

Couvre : FR3.

**Critères d'acceptation :**

**Étant donné** `src/lib/scryfall/utils/card-cache.ts` en `DB_VERSION = 5`
**Quand** la story est livrée
**Alors** le cache lit et écrit des `Card`
**Et** `DB_VERSION` passe à 6, et la mise à niveau vide les entrées de l'ancien format au lieu de les relire

**Étant donné** un navigateur dont le cache contient des entrées v5 et un profil en langue non anglaise
**Quand** l'utilisateur ouvre sa collection après la mise à jour
**Alors** toutes les images s'affichent (pas de blanchiment par une entrée périmée)

**Étant donné** un onglet resté ouvert sur l'ancienne version
**Quand** un nouvel onglet ouvre le cache en version 6
**Alors** aucun des deux onglets ne reste bloqué (comportement `onversionchange` conservé)

### Story 1.4 : Hooks et lectures Scryfall exposés en Card

**En tant que** développeur,
**Je veux** que les hooks qui interrogent Scryfall en direct (dont `useCardPrints`) renvoient des `Card`,
**Afin que** les composants n'aient plus jamais à manipuler `ScryfallCard`.

Couvre : FR4.

**Critères d'acceptation :**

**Étant donné** `src/lib/scryfall/hooks/useCardPrints.ts` et les autres lectures signalées par la story 1.1 hors composants
**Quand** la story est livrée
**Alors** elles renvoient des `Card`, la conversion passant par `src/lib/card/adapter.ts`
**Et** les consommateurs existants compilent sans transtypage (`as unknown as`)

**Étant donné** la page d'une carte et le sélecteur de print
**Quand** on affiche les prints d'une carte
**Alors** la liste, l'ordre et les images sont identiques à avant la story

### Story 1.5 : Composants 100 % Card et frontière verrouillée

**En tant que** développeur,
**Je veux** que PrintList, CardPrintPickerModal, UseCollectionCopyModal et ImportPreview ne manipulent que `Card`,
**Afin de** verrouiller la frontière : `ScryfallCard` ne peut plus réapparaître hors de la couche fournisseur.

Couvre : FR1, FR4, NFR5.

**Critères d'acceptation :**

**Étant donné** les composants listés et `src/lib/import/types.ts`
**Quand** la story est livrée
**Alors** ils ne référencent plus `ScryfallCard`

**Étant donné** la règle de la story 1.1
**Quand** elle passe de `warn` à `error`
**Alors** `npm run check` et `npm run build` restent verts

**Étant donné** un développeur qui réimporte `ScryfallCard` dans un composant
**Quand** il lance `npm run check`
**Alors** la vérification échoue avec le message de la règle

## Epic 2 : Catalogue toujours à jour

Les joueurs trouvent les cartes et sets récents, aux images en pleine définition, sans intervention manuelle : le catalogue prod se met à jour chaque semaine, signale les prints retirés et remappe les cartes des collections concernées par une fusion Scryfall.

### Story 2.1 : Action GitHub de seed du catalogue prod

**En tant que** propriétaire du projet,
**Je veux** une GitHub Action qui seede le catalogue prod à la demande et chaque semaine,
**Afin de** ne plus dépendre de mon poste ni de Coolify pour garder le catalogue à jour.

Couvre : FR5, FR9, NFR1, NFR2, NFR3, NFR6, NFR7, NFR8.

**Critères d'acceptation :**

**Étant donné** un workflow `.github/workflows/` déclenché par `workflow_dispatch` et par un cron hebdomadaire
**Quand** il s'exécute
**Alors** il fait un checkout de la branche `deploy` et lance les scripts de seed existants (sets puis catalogue)
**Et** l'URL Supabase et la clé service viennent d'un Environment GitHub `prod` limité aux branches `main` et `deploy`, jamais de secrets de dépôt

**Étant donné** une exécution qui échoue
**Quand** le job se termine
**Alors** une issue est ouverte automatiquement avec le lien vers le run (une seule issue ouverte à la fois pour ce motif)

**Étant donné** le premier run réel
**Quand** il se termine
**Alors** sa durée et son pic mémoire sont consignés dans la PR ou l'issue (limites du runner : 6 h, 7 Go)
**Et** le catalogue prod contient les sets et cartes sortis depuis le 2026-07-25
**Et** les prints ont leur vraie image `png` (plus dérivée de `large`)

**Étant donné** le dépôt PUBLIC
**Quand** le workflow s'exécute
**Alors** il ne publie aucun artefact ni aucun log contenant des données de la base

### Story 2.2 : Seed seulement si le catalogue Scryfall a changé

**En tant que** propriétaire du projet,
**Je veux** que l'Action ne seede que si le contenu Scryfall a changé depuis le dernier seed réussi, et affiche la date de ce seed,
**Afin d'**éviter des heures de seed inutiles et de savoir d'un coup d'œil de quand date le catalogue.

Couvre : FR6, NFR4, NFR7.

**Critères d'acceptation :**

**Étant donné** une migration SQL qui crée l'état du seed (date et empreinte du dernier seed réussi), idempotente, avec GRANT explicites et aucun accès `anon`/`authenticated` en écriture
**Quand** l'Action démarre
**Alors** elle calcule l'empreinte du contenu Scryfall (liste des sets + nombre de prints, ou hash), jamais le `updated_at` du bulk, régénéré chaque jour

**Étant donné** une empreinte identique à celle du dernier seed réussi
**Quand** l'Action s'exécute
**Alors** elle s'arrête en succès sans seeder, et le résumé du job l'indique

**Étant donné** un seed qui échoue à mi-chemin
**Quand** le job se termine
**Alors** la date et l'empreinte ne sont PAS mises à jour (le run suivant reseede)

**Étant donné** n'importe quel run
**Quand** il se termine
**Alors** le résumé du job affiche la date du dernier seed réussi

### Story 2.3 : Prints retirés marqués removed_at

**En tant que** joueur,
**Je veux** que les prints retirés par Scryfall n'apparaissent plus dans les recherches mais restent affichés dans ma collection,
**Afin de** ne pas tomber sur des cartes fantômes sans perdre celles que je possède.

Couvre : FR7, NFR4.

**Critères d'acceptation :**

**Étant donné** une migration SQL qui ajoute `card_prints.removed_at` (nullable, idempotente)
**Quand** l'Action lit `/migrations` de Scryfall après un seed réussi
**Alors** les prints dont l'id est l'ancien id d'un `delete` ou d'un `merge` reçoivent `removed_at`, sans jamais être supprimés

**Étant donné** un print marqué `removed_at`
**Quand** un joueur cherche des cartes ou parcourt un set
**Alors** ce print n'apparaît pas

**Étant donné** une `card_entry` dont le `scryfall_id` désigne un print marqué `removed_at`
**Quand** son propriétaire ouvre sa collection, sa wishlist ou un deck
**Alors** la carte s'affiche normalement

**Étant donné** une migration Scryfall déjà traitée
**Quand** l'Action repasse dessus
**Alors** rien ne change (idempotent)

### Story 2.4 : Remappage des cartes utilisateur via /migrations

**En tant que** joueur,
**Je veux** qu'une carte de ma collection fusionnée par Scryfall soit automatiquement rattachée au bon print,
**Afin que** mes cartes restent à jour sans action de ma part.

Couvre : FR8, NFR2, NFR3, NFR4.

**Critères d'acceptation :**

**Étant donné** une migration SQL qui crée le journal par ligne (`card_entry_id`, ancien id, nouvel id, id de migration Scryfall, date) et une fonction SQL (RPC) de remappage, sans aucun accès `anon`/`authenticated`
**Quand** l'Action traite les `merge` de `/migrations` après un seed réussi
**Alors** elle les applique dans l'ordre de `performed_at` (une fusion en chaîne A→B→C aboutit à C)
**Et** chaque migration est appliquée par un appel RPC transactionnel : réécriture de `card_entries.scryfall_id` et écriture au journal ensemble, ou rien

**Étant donné** une migration Scryfall déjà présente au journal
**Quand** l'Action repasse dessus
**Alors** elle est ignorée

**Étant donné** un seed qui a échoué
**Quand** le job continue
**Alors** aucun remappage n'est tenté

**Étant donné** un remappage à annuler
**Quand** le propriétaire consulte le journal
**Alors** chaque ligne permet de restaurer l'ancien `scryfall_id` exact, sans aucun backup exporté hors de la base
