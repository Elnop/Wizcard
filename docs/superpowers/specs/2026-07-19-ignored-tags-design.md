# Ignored Tags — réglage de compte (NSFW masqué par défaut)

Date : 2026-07-19

## Problème

Les prints custom (proxies communautaires / MPC) portent des tags libres, dont des
tags sensibles : `nsfw`, `nudity`, `gore`. Aujourd'hui ces prints sont visibles
partout :

- dans les listes de prints,
- sur la page d'une carte (`PrintsTab`),
- dans le print picker (`PrintList` via `CardPrintPickerModal`).

Un print custom sensible peut aussi avoir été **sélectionné** comme print d'une carte
de collection / de deck ; il s'affiche alors sur toutes les vues qui rendent cette
carte.

La recherche masque déjà le NSFW par défaut (`mustNotHave: ['n']`), mais rien
d'autre. On veut un réglage de compte qui masque le contenu sensible partout, avec
`nsfw` masqué par défaut — y compris pour l'utilisateur non connecté.

## Objectif

Une nouvelle catégorie de réglages **« Ignored Tags »** :

- masque **complètement** les prints custom portant un tag ignoré, sur les trois
  surfaces (listes de prints, page carte, print picker) ;
- remplace **à l'affichage** (non destructif) un print custom déjà sélectionné qui
  porte un tag ignoré, par un print officiel ;
- `nsfw` ignoré **par défaut** (utilisateur connecté comme invité) ;
- l'utilisateur peut **ajouter / enlever n'importe quel tag**.

## Décisions (validées)

| Sujet                        | Décision                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| Effet d'un tag ignoré        | Masquer **complètement** (pas de blur/reveal)                                       |
| Défaut invité (non connecté) | `['nsfw']` (aligné sur la recherche)                                                |
| Persistance (connecté)       | Colonne `profiles.ignored_tags` (Supabase), via sync-queue                          |
| Défaut connecté              | Colonne DB `default '{nsfw}'` — pas de logique de seed applicative                  |
| Fallback print sélectionné   | **À l'affichage**, non destructif (DB jamais réécrite)                              |
| Choix du print de repli      | Print officiel de la carte, **localisé d'abord** puis défaut                        |
| Portée du fallback           | **Générique** : tag ignoré **OU** échec de chargement du print custom               |
| Représentation des tags      | Noms complets, **lowercase** (`nsfw`, `nudity`, `gore`…), alignés sur `custom.tags` |
| Point de filtre listes       | Unique, dans `useCustomCardPrints`                                                  |
| Point de fallback affichage  | Étendre `CardImage` (point de rendu universel)                                      |
| UI du réglage                | Chips retirables + input libre autocomplété sur la taxonomie MPC                    |

## Architecture

### 1. Données

**Migration** `supabase/migrations/<timestamp>_add_profile_ignored_tags.sql` :

```sql
alter table public.profiles
  add column ignored_tags text[] not null default '{nsfw}'::text[];
```

Un nouveau profil démarre donc avec `['nsfw']`. Un utilisateur qui vide la liste voit
son choix respecté (liste vide en DB). Pas de seed applicatif.

Mettre à jour le script d'audit `supabase/verify_schema.sql` (assertion colonne
`ignored_tags`) et `supabase/verify_prod_schema.sql` le cas échéant, ainsi que
`supabase/bootstrap/init_schema.sql`.

**Types** (`src/lib/profile/types.ts`) :

- `Profile` : ajouter `ignoredTags: string[]`.
- `ProfileUpdate` : ajouter `'ignoredTags'` au `Pick`.

**Mapping DB** (`src/lib/profile/db/profiles.ts`) :

- `ProfileRow` : ajouter `ignored_tags: string[]`.
- `rowToProfile` : `ignoredTags: row.ignored_tags ?? ['nsfw']`.
- Les trois `select('… , ignored_tags, …')`.
- `upsertProfile` : `if (updates.ignoredTags !== undefined) cols.ignored_tags = updates.ignoredTags;`.

**Store** (`src/lib/profile/store/profile-store.ts`) :

- Le profil par défaut construit dans `hydrateProfile` (cas « pas de ligne »)
  reçoit `ignoredTags: ['nsfw']`.

La sync-queue existante (`profile-update`) transporte `ignoredTags` sans autre
changement.

### 2. Helpers

Nouveau module `src/lib/mpc/ignored-tags.ts` :

```ts
import type { Profile } from '@/lib/profile/types';
import type { CustomCard } from '@/lib/mpc/types';

export const DEFAULT_IGNORED_TAGS = ['nsfw'];

/** Tags effectifs : ceux du profil, ou le défaut invité si pas de profil. */
export function getEffectiveIgnoredTags(profile: Profile | null): string[] {
	return profile?.ignoredTags ?? DEFAULT_IGNORED_TAGS;
}

/** Vrai si un des tags du print custom est ignoré (comparaison lowercase). */
export function isIgnored(card: CustomCard, ignoredTags: string[]): boolean {
	if (ignoredTags.length === 0) return false;
	const ignored = new Set(ignoredTags.map((t) => t.toLowerCase()));
	return (card.custom.tags ?? []).some((t) => ignored.has(t.toLowerCase()));
}
```

### 3. Masquage dans les listes de prints, la page carte et le picker

Point unique : `src/lib/mpc/hooks/useCustomCardPrints.ts`.

- Lire le profil (`useProfileContext`) → `getEffectiveIgnoredTags`.
- Après résolution des `CustomCard`, filtrer ceux pour lesquels `isIgnored(...)` est
  vrai, **avant** de les renvoyer.

Ce hook alimente `PrintList` (picker) **et** `PrintsTab` (page carte) : les deux
surfaces héritent du filtre.

Note : le print « courant » (déjà sélectionné, marqué `isCurrentPrint`) est filtré
comme les autres si son tag est ignoré ; ce qui est _montré_ pour la carte
elle-même relève du fallback à l'affichage (§4), pas de cette liste.

### 4. Fallback générique à l'affichage — `CardImage`

`CardImage` (`src/lib/card/components/CardImage/CardImage.tsx`) est le point de rendu
universel de toute image de carte. Il possède déjà :

- une branche custom (`isCustomCard` → `custom.image_url`) ;
- une chaîne de repli **print localisé** (`useLocalizedImage`) → **print anglais /
  officiel** (`useEnglishFallbackImage`) → **placeholder au nom** ;
- un `onError` → `setError(true)` sur l'`<Image>`.

Extension : introduire une condition `shouldFallbackFromCustom`, vraie quand la carte
est un `CustomCard` **et** :

1. ses tags intersectent les `ignoredTags` effectifs (`isIgnored`), **ou**
2. son image a échoué à charger (état `error`, déjà présent), ou le custom card est
   irrésolu.

Quand `shouldFallbackFromCustom` est vraie, on **cesse** d'utiliser
`custom.image_url` et on route la carte par la **même** résolution localisée →
officielle déjà câblée, en clé sur `oracle_id`. Concrètement : la condition
`visible = !isInputCustom && …` (qui court-circuite aujourd'hui la résolution pour les
customs) devient `visible = (!isInputCustom || shouldFallbackFromCustom) && …`, et la
branche image custom n'est empruntée que si `isCustom && !shouldFallbackFromCustom`.

Ordre de repli conservé : **localisé d'abord**, puis officiel par défaut, puis
placeholder au nom.

`CardImage` obtient les `ignoredTags` effectifs via `useProfileContext`
(`ProfileProvider` est déjà haut dans l'arbre). Comme `CardImage` est le point unique,
toutes les surfaces d'affichage (collection, deck, sample hand, search…) héritent du
fallback sans modification individuelle.

**Non destructif** : la sélection en base (`scryfallId = 'mpc:<uuid>'`) n'est jamais
réécrite ; retirer le tag ré-affiche le print custom.

### 5. UI du réglage — `IgnoredTagsSection`

Nouveau composant
`src/app/[locale]/settings/sections/IgnoredTagsSection.tsx`, rendu dans
`SettingsView` entre `DisplaySection` et `PrivacySection`, suivant le pattern des
sections existantes (`SettingsSection` + `useSaveStatus` + `updateProfile`).

Contenu :

- **Chips** des tags ignorés, chacun retirable (✕) → `updateProfile({ ignoredTags })`.
- **Input** d'ajout avec autocomplétion sur la taxonomie MPC
  (`MPC_TAG_GROUPS` / `MPC_TAGS` de `src/lib/mpc/`) mais **acceptant toute saisie
  libre** (tag hors taxonomie autorisé).
- Normalisation : tag ajouté en **lowercase**, trim, pas de doublon.

i18n : nouvelles clés `settings.ignoredTags.*` (titre, description, placeholder
input, aria-labels) en **en** et **fr**.

## Cas limites

- **Tags en casse mixte** : stockage et comparaison en lowercase → matching robuste
  avec `custom.tags`.
- **Liste vidée par l'utilisateur** : `ignoredTags = []` → aucun masquage, aucun
  fallback tag-based (le fallback sur échec de chargement reste actif).
- **Print custom sélectionné devenu ignoré puis dé-ignoré** : réversible, car la DB
  n'est jamais modifiée.
- **Custom card sans `oracle_id`** : le fallback ne peut pas résoudre de print
  officiel → dernier recours = placeholder au nom (comportement existant).

## Hors périmètre (YAGNI)

- Pas de blur / click-to-reveal.
- Pas de réécriture destructive des sélections.
- Pas de masquage des cartes custom **créées par l'utilisateur** dans son propre
  atelier (le réglage cible l'affichage des prints, pas la gestion de contenu).
- Pas de synchronisation du réglage `ignoredTags` avec le défaut `mustNotHave` de la
  recherche (deux mécanismes distincts ; on n'unifie pas dans cette itération).

## Vérification

Pas de framework de test (cf. `project_no_test_framework`). Vérifier via :

- `npm run check` — pas de **nouveau** problème (baseline rouge, cf.
  `project_check_red_baseline`).
- `npm run sb:reset` / `sb:migrate` + `sb:verify` — migration appliquée, colonne
  présente.
- Runtime (dev) :
  - Invité : NSFW absent des listes de prints / page carte / picker.
  - Connecté : ajouter/enlever un tag → effet immédiat sur les trois surfaces.
  - Print custom NSFW sélectionné sur une carte de collection → fallback officiel
    localisé affiché ; retirer le tag → print custom réapparaît.
