---
title: 'Journal des changements du catalogue'
type: 'feature'
created: '2026-10-20'
status: 'done'
baseline_commit: '143ab00024c0133e895e86ddb9aa2eb03f72d912'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/docs/guides/migrations.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le seed hebdomadaire réécrit ~163 000 prints sans garder trace de ce qui a réellement changé. On ne peut donc pas dire quelles cartes ont changé d'un seed à l'autre, ni comment, alors que le digest « Catalogue » (story 3.3) en a besoin. Issue #60, story 3.1 de l'epic #59.

**Approach:** Une migration crée une table `catalog_changes`, réservée à `service_role`, et des triggers AFTER sur le catalogue. Ces triggers ne journalisent que les vraies différences, par comparaison `jsonb` des lignes OLD et NEW, champ par champ. Côté seed, les faces de prints passent de « delete puis insert » à un upsert : une face inchangée n'est plus touchée, et une face modifiée devient un UPDATE journalisable.

**Décision (revue, 2026-10-20) :** la légalité `oldschool`, calculée par print chez Scryfall, diverge entre les prints de 473 oracles. On garde « premier print gagne » sans filtrer `oldschool` : le pic d'environ 3 500 fausses lignes `legalities` au premier run en prod et les bascules occasionnelles sont acceptés et documentés. La vraie résolution est suivie dans #66.

## Boundaries & Constraints

**Always :**

- Migration idempotente. RLS activée sans aucune policy. `revoke all` explicite à `anon`/`authenticated` sur la table et sa séquence, car la default ACL de prod leur accorde sinon l'écriture. `grant select` à `service_role` pour le digest.
- Fonction trigger `security definer` avec `set search_path = ''`. Son `execute` est retiré à `public`.
- Toute colonne est suivie par défaut, nouvelles colonnes comprises, sauf `updated_at` et `card_definitions.edhrec_rank`. Ce dernier est un rang de popularité qui bouge chaque semaine : ce n'est pas un changement du catalogue.
- Une ligne de journal par champ modifié, avec l'ancienne et la nouvelle valeur en `jsonb`. Les lignes `added` et `removed` portent les identifiants. Une ligne `removed` porte aussi la ligne complète en `old_value`, puisque le print n'existe plus pour être joint.
- Le journal n'a pas de FK vers le catalogue : il survit à la suppression des prints.
- Assertions ajoutées dans `supabase/verify_schema.sql` dans le même changement.

**Never :**

- Aucun accès `anon`/`authenticated` au journal.
- Pas de digest, de table `articles` ni de migrations Scryfall : stories 3.2 à 3.4.
- Pas de journalisation de `card_parts` ni de `card_sets`.
- Ne rien lancer contre la prod. La migration prod est faite par le propriétaire (label `needs-migration`).

## I/O & Edge-Case Matrix

| Scénario                            | Entrée / état                                            | Comportement attendu                                                                                       |
| ----------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Upsert identique                    | print, définition ou face réécrits à l'identique         | 0 ligne                                                                                                    |
| Nouveau print / nouvelle définition | INSERT                                                   | 1 ligne `added` (`print_id`/`oracle_id`)                                                                   |
| Print retiré                        | DELETE par le seed (drift d'id Scryfall)                 | 1 ligne `removed` avec `old_value` = ligne complète ; ses faces supprimées en cascade ne journalisent rien |
| Champ de print modifié              | `image_uris`, `image_status`, `printed_text`…            | 1 ligne `updated` par champ, avec l'ancienne et la nouvelle valeur                                         |
| Oracle ou légalités modifiés        | UPDATE sur `card_definitions` ou `card_definition_faces` | 1 ligne `updated` par champ (`oracle_id`, `face_index` pour une face)                                      |
| Seul `edhrec_rank` change           | UPDATE                                                   | 0 ligne                                                                                                    |
| Face de print modifiée              | upsert d'une face au contenu différent                   | 1 ligne `updated` par champ (`print_id`, `face_index`)                                                     |
| Face disparue d'un print existant   | le print passe de 2 faces à 0                            | 1 ligne `removed` pour chaque face                                                                         |

</frozen-after-approval>

## Code Map

- `supabase/migrations/20260723120001_create_card_catalog.sql` -- schéma des 5 tables du catalogue et modèle des grants et de la RLS (ne pas modifier).
- `scripts/seed/seed-catalog.ts:221` `flushPrintFaces` -- aujourd'hui `delete().in('print_id')` puis `insert`. C'est la seule écriture à changer. `flushDefs`, `flushDefinitionFaces` et `flushPrints` sont déjà des upserts. `deleteDriftedPrints` (l.169) est la seule suppression de prints.
- `scripts/seed/normalize-catalog-card.ts` -- les rows n'envoient pas `updated_at`, donc pas de bruit de ce côté. `edhrec_rank` est envoyé (à ne pas modifier).
- `supabase/verify_schema.sql` -- section 7 TRIGGERS (l.~405, liste `tg`), helpers `pg_temp.chk`/`has_table`/`rls_on`/`has_trigger`, bloc catalogue (l.~600-850 : colonnes attendues, grants, sécurité).
- `scripts/lib/load-env.ts` -- `.env.seed` est chargé avec `override:true`. Avant tout seed local, vérifier que la cible résolue est `127.0.0.1`.

## Tasks & Acceptance

**Execution:**

- [x] `supabase/migrations/20261020120000_create_catalog_changes.sql` -- table `public.catalog_changes` (`id` bigint identity PK ; `changed_at` timestamptz default now() ; `entity` check in `print`/`print_face`/`definition`/`definition_face` ; `change` check in `added`/`removed`/`updated` ; `print_id` uuid ; `oracle_id` uuid ; `face_index` smallint ; `field` text ; `old_value`/`new_value` jsonb), index sur `changed_at`, fonction `public.log_catalog_change()` et triggers AFTER ROW (voir Design Notes), RLS, revoke et grants.
- [x] `scripts/seed/seed-catalog.ts` -- `flushPrintFaces` : upsert `onConflict: 'print_id,face_index'`, puis suppression des faces en trop. Les prints du lot sont groupés par nombre de faces `k`, et pour chaque groupe on supprime `.in('print_id', chunk).gte('face_index', k)`, découpé en `DELETE_CHUNK`. Le commentaire est mis à jour.
- [x] `supabase/verify_schema.sql` -- table, colonnes, RLS, absence de policy, triggers (4 tables), fonction, `anon`/`authenticated` sans SELECT/INSERT/UPDATE/DELETE, `service_role` avec SELECT.
- [x] `supabase/tests/catalog_changes.sql` -- script psql exécuté dans une transaction `rollback`, qui rejoue chaque ligne de la matrice I/O sur des lignes de test et échoue via `raise exception` au premier écart.
- [x] `docs/guides/catalog-seed.md` -- court paragraphe sur le journal : ce qu'il contient, les champs exclus, l'accès réservé à `service_role`.

**Acceptance Criteria:**

- Given une base locale migrée, when `npm run sb:verify` est lancé, then il sort en 0 avec les nouvelles assertions en PASS.
- Given le catalogue local seedé une première fois après la migration, when on relance un seed complet le même jour (même bulk), then `select count(*) from catalog_changes where changed_at > <début du 2ᵉ run>` vaut 0.
- Given `anon` ou `authenticated`, when ils lisent ou écrivent `catalog_changes` via PostgREST, then ils sont refusés.

## Design Notes

Une seule fonction générique, aiguillée sur `TG_TABLE_NAME` et `TG_OP` :

```sql
-- UPDATE : un diff par clé jsonb, hors clés exclues
for k in select key from jsonb_each(to_jsonb(new))
  where key not in ('updated_at','edhrec_rank')
    and to_jsonb(new)->key is distinct from to_jsonb(old)->key loop
  insert into public.catalog_changes(...) values (..., k, to_jsonb(old)->k, to_jsonb(new)->k);
end loop;
```

- Triggers UPDATE avec `WHEN (old.* is distinct from new.*)`, pour qu'un upsert identique ne coûte presque rien. La clause porte sur la ligne entière. `edhrec_rank` est ensuite écarté dans la boucle.
- `card_prints` et `card_definitions` : INSERT (`added`), UPDATE ; DELETE (`removed`) seulement sur `card_prints`, le seed ne supprimant jamais de définition.
- `card_print_faces` : UPDATE et DELETE. Une suppression n'est journalisée que si le print parent existe encore, ce qui écarte la cascade d'un print retiré.
- `card_definition_faces` : UPDATE seulement.
- Les INSERT de faces ne sont pas journalisés : ils accompagnent un print ou une définition déjà journalisés comme `added`.

Le premier seed sur une base vide journalise une ligne `added` par print et par définition, soit environ 200 000 lignes. C'est attendu : en prod, le catalogue est déjà peuplé.

## Verification

**Commands:**

- `npm run sb:migrate && npm run sb:verify` -- expected : exit 0.
- `docker exec -i supabase_db_scute_swarm psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/catalog_changes.sql` -- expected : exit 0.
- `npm run seed` deux fois de suite sur la base locale, en arrière-plan -- expected : le 2ᵉ run ajoute 0 ligne au journal.
- `npm run check && npm run build` -- expected : exit 0.

## Implementation Notes

- Bruit trouvé au 2ᵉ seed local : 3 472 lignes `legalities` sur 473 oracles, toutes sur la clé `oldschool`. Scryfall donne cette légalité par print, donc les prints d'un même oracle ne s'accordent pas et la définition basculait de l'un à l'autre au fil du run. Correctif dans `seed-catalog.ts` (pass 1) : une seule écriture de définition et de faces de définition par oracle et par run, celle du premier print. Le bulk étant trié par id de print, ce choix est stable d'un run à l'autre. Il ne change que si un nouveau print d'id plus petit apparaît, ou si ce print disparaît.
- Vérifié sur catalogue local vidé : 1ᵉʳ seed = 35 624 `added` définitions + 163 739 `added` prints ; 2ᵉ seed = 0 ligne.
- `service_role` garde les privilèges que lui donne la default ACL (seul `select` est accordé explicitement) ; la fonction trigger écrit en `security definer`.

## Spec Change Log

## Review Triage Log

| #   | Source             | Constat                                                                                             | Verdict     | Preuve                                                                                                                                                                          | Route                                               |
| --- | ------------------ | --------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 1   | blind, edge        | Une face ajoutée à un print ou une définition existants n'est pas journalisée                       | low         | Réel, mais un print qui gagne une face est rare, et le corriger demande de distinguer un parent créé dans une autre transaction (complexité ajoutée)                            | rejeté                                              |
| 2   | blind, edge        | Une face de définition retirée n'est ni supprimée ni journalisée                                    | medium      | Préexistant : `flushDefinitionFaces` n'a jamais supprimé de face                                                                                                                | defer                                               |
| 3   | blind, edge, verif | « Premier print gagne » dépend de l'ordre du bulk : fausses bascules de `oldschool`                 | medium      | Confirmé (473 oracles divergents)                                                                                                                                               | décision du propriétaire : garder, documenter, #66  |
| 4   | blind              | Pic de fausses lignes `legalities` au premier run en prod, non documenté                            | medium      | Dernier print → premier print sur la prod déjà seedée                                                                                                                           | patch (doc)                                         |
| 5   | blind, edge        | Un id réémis (drift) apparaît comme `removed` + `added` sans lien                                   | low         | La ligne `removed` porte le triplet complet, donc le digest peut les apparier                                                                                                   | defer (story 3.3)                                   |
| 6   | blind              | Pas d'identifiant de run ni de source                                                               | false       | L'epic fixe la fenêtre du digest : « depuis le dernier article », pas par run                                                                                                   | rejeté                                              |
| 7   | blind              | Pas de politique de rétention                                                                       | low         | Volume hebdomadaire faible ; hors intention                                                                                                                                     | rejeté                                              |
| 8   | blind              | `service_role` garde l'écriture et le TRUNCATE, contrairement au commentaire « read only »          | medium      | Default ACL ; la fonction SECURITY DEFINER n'en a pas besoin                                                                                                                    | patch                                               |
| 9   | verif, blind       | Le test SQL n'a ni script npm ni lanceur                                                            | medium      | Seul un `docker exec` manuel le lance                                                                                                                                           | patch (script npm) + defer (mention dans AGENTS.md) |
| 10  | verif              | La synchro des faces et le dédoublonnage des oracles ne sont pas testés                             | medium      | Aucun test n'importe `seed-catalog.ts`                                                                                                                                          | patch (fonctions pures + node:test)                 |
| 11  | blind              | `verify_schema` ne vérifie les triggers que par leur nom                                            | low         | Même niveau de contrôle que les triggers existants                                                                                                                              | rejeté                                              |
| 12  | blind              | Requête DELETE pour k = 0 à chaque lot                                                              | false       | L'ancien code supprimait déjà tous les ids du lot                                                                                                                               | rejeté                                              |
| 13  | blind              | Le commentaire de dédoublonnage par lot dans `flushDefs`/`flushDefinitionFaces` est devenu trompeur | low         | Correction directe d'un commentaire                                                                                                                                             | patch                                               |
| 14  | edge               | `WHEN old.* is distinct from new.*` casse sur une future colonne `json`                             | low         | Aucune colonne `json` aujourd'hui, et le seed n'en crée pas                                                                                                                     | rejeté                                              |
| 15  | edge               | Le test SQL compte `id > base` : faussé si un seed tourne en même temps                             | low         | Correction directe : filtrer sur les ids de test                                                                                                                                | patch                                               |
| 16  | edge               | Le premier print sans faces masque les faces d'un print suivant                                     | maybe-false | Les cartes réversibles n'ont pas d'`oracle_id` au niveau carte et sont écartées ; il faudrait vérifier dans le bulk un oracle dont les prints n'ont pas le même nombre de faces | rejeté (si réel, low)                               |
