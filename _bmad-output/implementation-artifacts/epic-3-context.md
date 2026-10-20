# Epic 3 Context: Notes de changement du catalogue & articles

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Chaque semaine, les joueurs lisent sur Wizcard ce qui a changé dans le catalogue Magic : nouveaux sets, cartes ajoutées, images en haute définition, errata, bans, corrections Scryfall. Le seed hebdomadaire (workflow `catalog-seed` de l'epic 2) journalise en base les vraies différences et publie lui-même un article « Catalogue », sans relecture. C'est la première brique du futur chantier « articles » (news Magic et news du site). Projet brownfield sans PRD, architecture ni document UX : ce contexte vient du découpage en epics et du cadrage durci du 2026-10-19 (issue #58, epic GitHub #59).

## Stories

- Story 3.1 : Journal des changements du catalogue
- Story 3.2 : Migrations Scryfall stockées en base
- Story 3.3 : Digest « Catalogue » publié après chaque seed
- Story 3.4 : Pages articles
- Story 3.5 : Mise en prod et premier digest

## Requirements & Constraints

- **Changements suivis :** nouveaux sets et prints, sets complétés, prints retirés (supprimés par le seed), images (`image_status`, URLs), errata d'oracle (texte, type, coût, P/T…), légalités et bans, textes FR imprimés. Le journal dit QUELLES cartes ont changé (print ou `oracle_id`, champ, ancienne et nouvelle valeur, date), pas seulement des comptes.
- **Bruit nul :** le seed réécrit ~163 000 prints chaque semaine. Un upsert identique ne journalise rien ; un seed complet sur une base déjà à jour ajoute zéro ligne. C'est le critère de vérification clé de la story 3.1.
- **Migrations Scryfall :** toutes les pages de `/migrations` (`merge` et `delete`, ancien/nouvel id, note, `performed_at`) sont upsertées par id Scryfall après un seed réussi, de façon idempotente. Une réponse incomplète ou en erreur fait échouer le job (issue d'alerte) sans écrire de liste partielle.
- **Digest :** un seul article par seed, seulement s'il y a au moins un changement (pas de seuil). Il est généré en fr et en en à partir d'un gabarit traduit (`messages/*.json`) et des données réelles : **jamais de LLM**. Le titre reprend l'événement le plus fort (nouveau set > set complété > traductions FR > images HD > reste) ; chaque autre type forme une section. Une rotation Standard se résume en une ligne. Les migrations Scryfall citent les cartes de référence (ancien print → nouveau, note). Sans changement, aucun article et le résumé du job le dit.
- **Fenêtre et reprise :** un trigger ne connaît pas le run. Le digest couvre tout ce qui a été journalisé depuis le dernier article « Catalogue » publié : un seed raté à mi-chemin ne perd ni ne publie en double ses changements.
- **Confidentialité :** aucun article ne contient de donnée utilisateur (collections, comptes, cartes remappées d'un joueur). Seules les données de référence du catalogue sont publiées.
- **Pages :** `/articles` liste les articles publiés du plus récent au plus ancien, avec filtre par catégorie ; la page d'article affiche titre et corps dans la langue du visiteur, et les cartes citées comme cartes (image, lien vers la page de la carte). Les deux pages sont traduites et indexables. Les articles écrits à la main resteront mis en avant plus tard.
- **Premier run en prod :** reporter dans l'issue de la story la durée ajoutée au job (limites du runner : 6 h, 7 Go).
- **Vérification :** `npm run check` reste vert à chaque story.
- **Hors périmètre :** rédaction manuelle, interface d'administration, prix, langues absentes du catalogue (de/es/it/ja).

## Technical Decisions

- **Journal par triggers :** triggers sur `card_prints` et `card_definitions` avec clause `WHEN … IS DISTINCT FROM`, pour ne journaliser que les vraies différences. Table du journal sans aucun accès `anon`/`authenticated`.
- **Faces recto-verso :** `card_print_faces` est supprimé puis réinséré à chaque run, et les images des cartes recto-verso vivent sur les faces. Il faut une comparaison dédiée : rien n'est journalisé sans changement réel, mais un vrai changement d'image ou de texte sur une face l'est.
- **Table des migrations Scryfall :** lisible seulement par `service_role`. C'est la source unique pour le digest et pour le remappage de la story 2.4.
- **Table `articles` générique :** catégorie, slug, titre et corps fr/en, date de publication, source. Source unique des articles (pas de MDX dans le dépôt). Lisible par `anon`/`authenticated`, modifiable seulement par `service_role`.
- **Écritures prod :** jamais d'accès direct à Postgres prod ; tout passe par PostgREST avec la clé service, comme le seed existant. Le workflow exécute le code de la branche `deploy`.
- **Migrations SQL :** idempotentes, avec des GRANT explicites (la default ACL prod accorde sinon des droits d'écriture à `anon`/`authenticated`), label `needs-migration`, appliquées en prod par le propriétaire avant le déploiement et vérifiées par `npm run sb:verify:prod`.
- **SEO :** canonical et hreflang par page via la couche SEO i18n existante.
- **Options rejetées :** texte rédigé par LLM, instantané agrégé (comptes seuls), articles MDX, seuils de publication, empreinte de changement (#51), `removed_at` (#52, les prints retirés deviennent des lignes du journal).

## Cross-Story Dependencies

- Dépend de l'epic 2 : workflow `catalog-seed` (story 2.1) qui seede la prod chaque semaine et ouvre une issue en cas d'échec.
- Ordre conseillé : 3.1 → 3.2 → 3.3 → 3.4 → 3.5.
- 3.3 lit le journal (3.1) et les migrations (3.2), et écrit dans `articles` : la table créée par 3.4 doit donc exister avant (migration à anticiper ou à livrer avec 3.3).
- La story 2.4 (remappage, #53) vient après 3.2, dont elle réutilise les migrations stockées en base.
- 3.5 suppose les migrations SQL de 3.1, 3.2 et 3.4 appliquées en prod, puis `deploy` avancé. Les pages arrivant en dernier, le journal peut tourner quelques semaines sans lecteur.
