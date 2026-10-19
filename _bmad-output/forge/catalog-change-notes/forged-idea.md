# Notes de changement du catalogue & articles

**Issue de forge : DURCIE (2026-10-19)**

## Décisions verrouillées

- **Lecteur :** les joueurs. Les articles servent à la fois de news Magic et de news sur le développement du site.
- **Publication :** un article « Catalogue » est publié automatiquement, sans relecture, après chaque seed qui contient au moins un changement. Pas de seuil.
- **Rythme :** un seul digest par seed, donc quasi hebdomadaire et assumé comme tel. Il va dans la catégorie « Catalogue », filtrable, et les articles écrits à la main restent mis en avant.
- **Titre :** il reprend l'événement le plus fort (nouveau set > set complet > traductions FR > images HD > reste). Les autres changements forment des sections.
- **Rédaction :** un gabarit traduit en français et en anglais (`messages/*.json`), rempli avec les données réelles du catalogue. Pas de LLM.
- **Comparaison :** un journal par print. Des triggers sur `card_prints` et `card_definitions` journalisent seulement les vraies différences (`WHEN … IS DISTINCT FROM`), ce qui permet de savoir QUELLES cartes ont changé.
- **Changements suivis :** nouveaux sets et prints, sets complétés, images (`image_status`), errata d'oracle, légalités et bans (une rotation Standard est résumée en une ligne), textes FR imprimés, prints retirés.
- **Migrations Scryfall :** elles figurent dans l'article public, avec les cartes de référence concernées (ancien print → nouveau, note Scryfall). JAMAIS de données utilisateur.
- **Stockage :** une table `articles` générique en base (catégorie, slug, titre et corps en fr/en, date de publication, source). C'est la source unique. La rédaction manuelle via une interface d'administration relève du futur chantier « articles ».

## Périmètre de l'epic

Cinq stories :

1. Journal des changements (triggers avec clause `WHEN`, traitement des faces et des suppressions).
2. Migrations Scryfall `/migrations` ingérées en base comme donnée de référence.
3. Génération du digest après le seed (depuis le dernier digest).
4. Table `articles`, page `/articles` avec filtre par catégorie, page d'article (i18n, SEO indexable).
5. Mise en prod et vérification du premier digest.

Hors périmètre : la rédaction manuelle, l'interface d'administration, les données utilisateur dans les articles.

## Options rejetées

- **Texte rédigé par un LLM sans relecture :** une erreur publiée sous le nom du site.
- **Instantané agrégé (comptes seulement) :** ne dit pas quelles cartes ont changé.
- **Articles en MDX dans le dépôt :** deux sources à fusionner dans le fil, et un commit automatique chaque semaine.
- **Seuils (100 images HD / 50 % FR) :** remplacés par un digest hebdomadaire assumé.
- **#51, empreinte de changement :** abandonnée, le reseed reste systématique.
- **#52, `removed_at` :** remplacé, les prints retirés deviennent des lignes du journal.

## Points faibles à traiter dans la spec

- **Upserts systématiques :** le seed upserte 163 000 prints par semaine. Sans clause `WHEN` stricte, le journal explose.
- **Faces :** `card_print_faces` est supprimé puis réinséré à chaque run, et les images des cartes recto-verso vivent sur les faces. Il faut une comparaison dédiée.
- **Attribution au bon seed :** un trigger ne connaît pas le run. Le digest couvre la fenêtre écoulée depuis le dernier digest publié.
- **Échec du seed :** un seed qui échoue à mi-chemin a déjà journalisé une partie des changements. Le digest suivant doit les reprendre sans doublon.
- **Story 4 visible tard :** les pages arrivent en dernier, le journal tournera donc quelques semaines sans lecteur.
- **#53 (remappage) :** il est gardé et vient après la story 2, dont il réutilise les migrations stockées en base.
