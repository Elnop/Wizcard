# Page de configuration du compte — Design

**Date** : 2026-07-13
**Statut** : validé (design), en attente relecture avant plan d'implémentation

## But

Ajouter une page `/settings` centralisant la configuration du compte et les
préférences utilisateur. Aujourd'hui l'app n'a aucune page de réglages : les
préférences existantes (PDF, filtres) sont dispersées en `localStorage`
(Zustand `persist`), et l'édition du profil public (nickname/bio/avatar) est
prévue mais éparse. Cette page devient le point unique d'édition du compte et
des préférences, avec **stockage en base** sur la table `profiles` en
**colonnes typées** (pas de jsonb fourre-tout).

## Périmètre v1

Inclus :

- Section **Profil** : nickname, description, avatar (migre ici ; `/users/[id]`
  devient lecture seule).
- Section **Langue** : `language` unique et global (données cartes Scryfall +
  future UI i18n). Sélecteur fonctionnel pour les cartes ; note « interface
  bientôt » — pas de lib i18n installée dans ce chantier.
- Section **Affichage** : thème (stocké seulement, cf. hors-scope), affichage
  des prix on/off, devise du marché.
- Section **Confidentialité** : profil public/privé (flag unique).
- Section **Compte** : changement d'email, changement de mot de passe,
  suppression de compte (via Supabase Auth).

Hors-scope (chantiers séparés) :

- **Bascule CSS réelle du thème** : l'app n'a aucun système de thème
  (couleurs en dur). On crée la colonne `theme_preference` et le sélecteur
  (câblé DB), mais l'application visuelle claire/sombre fera l'objet d'un spec
  dédié ultérieur (audit couleurs → variables CSS).
- **i18n de l'interface** : pas d'installation de `next-intl`/`i18next`. La
  colonne `language` est le futur point d'entrée ; l'UI restera en français
  pour l'instant.
- **Notifications** : aucun système d'emails transactionnels hors auth → YAGNI.

## Schéma DB

Nouvelle migration `ALTER TABLE public.profiles` ajoutant 5 colonnes typées,
toutes NULL-safe avec default et contrainte :

| Colonne            | Type      | Contrainte / default                                                       |
| ------------------ | --------- | -------------------------------------------------------------------------- |
| `language`         | `text`    | `check (language in ('en','fr'))` default `'fr'`                           |
| `price_currency`   | `text`    | `check (price_currency in ('eur','usd'))` default `'eur'`                  |
| `show_prices`      | `boolean` | not null default `true`                                                    |
| `theme_preference` | `text`    | `check (theme_preference in ('light','dark','system'))` default `'system'` |
| `is_public`        | `boolean` | not null default `true`                                                    |

Backfill : les colonnes ayant un default, les lignes existantes prennent
automatiquement `fr` / `eur` / `true` / `system` / `true`.

### RLS

La policy `select` de `profiles` passe de `using (true)` à :

```sql
using (is_public or auth.uid() = id)
```

Effet : un profil `is_public = false` reste lisible par son propriétaire
(session authentifiée) mais devient invisible aux visiteurs anonymes et aux
autres utilisateurs. Les policies `insert`/`update` (propriétaire uniquement)
restent inchangées.

`/users/[id]` doit renvoyer **404** quand la ligne profil n'est pas visible
(row absente du résultat filtré par RLS), plutôt qu'une page vide.

**Confidentialité étendue à TOUTES les données utilisateur** : le toggle ne
masque pas seulement la page profil. Les tables à lecture publique
(`decks`, `deck_folders`, `cards` — decks + collection + wishlist) sont
également filtrées par la visibilité du profil propriétaire, sinon un visiteur
connaissant l'`owner_id` (ou détenant un ancien lien de deck partagé) pourrait
toujours lire les données d'un profil privé au niveau API. Migration dédiée
(`20260713130000_privacy_gate_public_reads`) : un helper `SECURITY DEFINER`
`public.profile_is_public(uuid)` + réécriture des policies SELECT publiques en
`using (<prédicat existant> and (profile_is_public(owner) or auth.uid() = owner))`.
La protection du prix d'achat (`purchase_price`) reste assurée par les grants
au niveau colonne pour `anon` (inchangés), pas par l'absence de policy —
vérifié par des SELECT anon explicites.

## Architecture front

Route `src/app/settings/` :

```
src/app/settings/
  page.tsx                      server: garde auth (redirect /auth/login si anon),
                                fetch profil complet, robots noindex
  SettingsView.tsx              client: layout des sections empilées
  sections/
    ProfileSection.tsx          nickname, description, avatar (upload bucket avatars)
    LanguageSection.tsx         language + note "interface bientôt"
    DisplaySection.tsx          theme_preference, show_prices, price_currency
    PrivacySection.tsx          is_public
    AccountSection.tsx          email, password, suppression (Supabase Auth)
```

Chaque section est un composant client isolé qui gère sa propre sauvegarde et
son propre état visuel — responsabilités séparées, testables/lisibles
indépendamment.

### Sauvegarde : auto-save par champ

Pas de bouton « Enregistrer » global. Chaque champ persiste onChange (selects,
toggles) ou onBlur (champs texte) via un update de sa seule colonne. Chaque
section affiche un indicateur d'état : `idle → saving → saved → error`
(retry possible sur error).

Les préférences DB alimentent le `ProfileContext` existant afin que l'app
réagisse sans reload :

- `language` → lu par la couche d'affichage des cartes Scryfall (là où la
  langue est actuellement déduite/en dur).
- `show_prices` / `price_currency` → lus par les composants d'affichage de prix.
- `theme_preference` → stocké seulement, aucun effet visuel en v1.

### Types

Étendre `src/lib/profile/types.ts` :

- `Profile` gagne `language`, `priceCurrency`, `showPrices`, `themePreference`,
  `isPublic`.
- `ProfileUpdate` couvre ces champs (en plus de nickname/description/avatarUrl).

Le mapping DB (snake_case) ↔ app (camelCase) suit le pattern existant dans
`src/lib/profile/db/`.

## Flux Compte (Supabase Auth)

- **Email** : `supabase.auth.updateUser({ email })`. Double opt-in par défaut →
  mail de confirmation. UI : champ + bouton, message « vérifie ta boîte mail ».
  En local, mail visible dans Inbucket (`npm run sb:mail`).
- **Mot de passe** : `supabase.auth.updateUser({ password })`. Champ nouveau
  mdp + confirmation, validation longueur minimale. L'ancien mot de passe n'est
  pas requis (session déjà authentifiée).
- **Suppression de compte** : zone danger, confirmation via `ConfirmModal`
  existant (retape le nickname). Un client ne peut pas se supprimer lui-même →
  route serveur `src/app/api/account/delete/route.ts` qui vérifie la session
  puis appelle `admin.deleteUser` avec la clé service-role. Le
  `on delete cascade` de `profiles.id → auth.users(id)` nettoie le reste.

## Vérification

Aucun framework de test dans le projet (cf. convention interne) — vérification
par `npm run check` + runtime + outils Supabase.

- `npm run check` (TypeScript + ESLint + Prettier) doit passer.
- `npm run sb:reset` puis `npm run sb:verify` : appliquer la migration sur DB
  vierge et auditer la conformité. **Étendre `supabase/verify_schema.sql`**
  avec des assertions sur les 5 nouvelles colonnes (présence, type, default,
  check) et la policy `select` modifiée.
- Runtime (dev) : parcourir `/settings`, éditer chaque champ, vérifier
  l'auto-save (indicateur + persistance après reload), vérifier que `language`
  change la langue des cartes et `show_prices`/`price_currency` l'affichage des
  prix ; tester le flux email (Inbucket via `sb:mail`), changement mdp,
  suppression de compte.
- RLS : un profil `is_public = false` renvoie 404 à un visiteur anonyme sur
  `/users/[id]` mais reste visible pour son propriétaire.

## Déploiement

Suivre le workflow prod habituel : migration idempotente exécutée dans le SQL
editor prod (Supabase self-hosted / Coolify), synchro de `schema_migrations`,
avance de la branche `deploy`.
