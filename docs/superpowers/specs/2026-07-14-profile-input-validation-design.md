# Validation & normalisation des champs de profil

**Date** : 2026-07-14
**Statut** : conçu, en attente de plan d'implémentation

## Contexte

Le nickname sert d'identifiant dans les URLs `/users/<nickname>/...`. Il n'existe
aujourd'hui aucune restriction de charset ni de longueur côté serveur : la seule
garde est `maxLength={50}` sur l'input et un `.trim()` au commit. Conséquence : un
nickname avec espaces (`leon le testeur`) ou caractères d'URL (`/`, `%`, …) provoque
des bugs de routage et de résolution.

Un bug lié (nickname non décodé côté client dans `ProfileShell.tsx`) a déjà été
corrigé via `decodeURIComponent`. La présente spec durcit la validation en amont
pour empêcher que des valeurs problématiques n'entrent en base.

### État actuel

- **Nickname** : colonne `text`, pas de CHECK. Index unique case-insensitive
  `profiles_nickname_lower_key` (déjà en place). Défaut auto-généré `wizard_<hex>`
  via trigger `handle_new_user`. UI : `maxLength=50` + `.trim()` + `isNicknameTaken()`.
- **Description** : colonne `text`, pas de CHECK. UI : `maxLength=500` + `.trim()`.
- Aucun module de validation partagé.
- Audit des données existantes (2 profils) : **0 violation** des règles ci-dessous
  → aucune migration de données nécessaire.

## Objectifs

1. Charset et longueur cohérents, URL-safe, appliqués côté client ET base.
2. Unicité robuste (déjà présente ; durcir la gestion d'erreur et l'ordre du check).
3. Bloquer une petite liste de nicknames réservés (collision de route / usurpation).

Hors périmètre (YAGNI) : colonne slug séparée, forçage minuscules, backfill.

## Règles

### Nickname

- **Normalisation** (`normalizeNickname`) appliquée au commit, avant validation :
  - `trim()`
  - collapse des espaces internes multiples (`\s+` → un seul espace).
- **Longueur** : 3 à 30 caractères (après normalisation).
- **Charset** : `^[\p{L}\p{N}. _-]+$` (lettres unicode avec casse préservée, chiffres,
  point, underscore, tiret, espace). Interdits : `/ \ % ? # &`, control chars, chaîne
  uniquement composée d'espaces/ponctuation.
- **Réservés** (comparaison case-insensitive) :
  `admin, api, settings, login, logout, signup, users, wizard, null, undefined`.
- **Casse** : préservée à l'affichage ; unicité case-insensitive (index existant).
- Le défaut `wizard_<hex>` reste valide (13 chars, alphanum + `_`). Note : `wizard`
  seul est réservé mais `wizard_xxxxxx` ne l'est pas — le préfixe auto n'est pas cassé.

### Description

- `trim()`, longueur ≤ 500. Texte libre, pas de charset.

## Architecture

### 1. Module partagé `src/lib/profile/validation.ts`

Source unique de vérité, importable client et serveur. Exporte :

- Constantes : `NICKNAME_MIN = 3`, `NICKNAME_MAX = 30`, `DESCRIPTION_MAX = 500`,
  `RESERVED_NICKNAMES` (Set), `NICKNAME_CHARSET` (RegExp).
- `normalizeNickname(raw: string): string` — trim + collapse espaces.
- `validateNickname(normalized: string): NicknameValidation` où
  `NicknameValidation = { ok: true } | { ok: false; code: NicknameErrorCode }`
  avec `NicknameErrorCode = 'tooShort' | 'tooLong' | 'invalidChars' | 'reserved'`.
  Le code mappe 1:1 sur une clé i18n. `validateNickname` ne teste PAS l'unicité
  (asynchrone, DB) — c'est le rôle de `isNicknameTaken`.

Unité isolée : entrée = string, sortie = verdict pur, aucune dépendance réseau.
Testable sans DB (bien que le repo n'ait pas de framework de test — voir
`project_no_test_framework` ; vérification via `npm run check` + runtime).

### 2. Contraintes DB — nouvelle migration

`supabase/migrations/<timestamp>_profile_field_constraints.sql`, idempotente
(chaque `add constraint` précédé de `drop constraint if exists`), conforme au
workflow de migration prod (script idempotent rejouable) :

```sql
alter table public.profiles drop constraint if exists profiles_nickname_valid;
alter table public.profiles drop constraint if exists profiles_description_len;

alter table public.profiles
  add constraint profiles_nickname_valid check (
    nickname is null or (
      char_length(nickname) between 3 and 30
      and nickname ~ '^[[:alnum:]._ -]+$'          -- aligné sur le module TS (voir note unicode)
      and lower(nickname) not in (
        'admin','api','settings','login','logout','signup','users','wizard','null','undefined'
      )
    )
  ),
  add constraint profiles_description_len check (
    description is null or char_length(description) <= 500
  );
```

Note unicode : Postgres `[[:alnum:]]` dépend de la locale de la base. Le module TS
utilise `\p{L}\p{N}` (unicode strict). Le CHECK DB est un **garde-fou** volontairement
un cran plus permissif si nécessaire ; la validation client précise reste l'autorité
UX. Décision d'implémentation : vérifier au moment du plan que `[[:alnum:]]` accepte
bien les lettres accentuées sur la locale de la DB (sinon utiliser une classe
explicite). L'index unique case-insensitive existant reste inchangé.

### 3. Câblage UI — `ProfileSection.tsx`

`commitNickname` — nouvel ordre :

1. `const normalized = normalizeNickname(nickname)`
2. si `normalized === (profile.nickname ?? '')` → return (rien changé)
3. si `normalized` non vide : `const v = validateNickname(normalized)` ; si `!v.ok`
   → `setNicknameError(t(\`nickname\${Cap(v.code)}\`))` et return
4. si non vide : `isNicknameTaken(normalized, user.id)` → si pris, `nicknameTaken`
5. `updateProfile({ nickname: normalized || null })`

Input : `maxLength={30}`. Description : inchangée (`maxLength={500}`), le `.trim()`
au commit reste.

### 4. Unicité — durcissement

- Le check `isNicknameTaken` porte sur la valeur **normalisée** (évite qu'un double
  espace passe le check puis collisionne après normalisation).
- `upsertProfile` (dans `db/profiles.ts`) : intercepter l'erreur Postgres unicité
  (`code === '23505'` sur `profiles_nickname_lower_key`) et la remonter comme un
  résultat "taken" typé, pour que l'UI affiche `nicknameTaken` même si le check
  optimiste a raté une course. L'index DB reste l'autorité finale (TOCTOU-safe).

### 5. i18n

Nouvelles clés sous `settings.profile.*` dans **toutes** les locales :
`nicknameTooShort`, `nicknameTooLong`, `nicknameInvalidChars`, `nicknameReserved`.
`nicknameTaken` et `nicknameCheckFailed` existent déjà. Interpoler les bornes
(`{min}`, `{max}`) dans les messages de longueur.

## Flux de données

```
input (raw) ──onBlur──▶ normalizeNickname ──▶ validateNickname ──▶ isNicknameTaken ──▶ updateProfile
                                    │                  │                   │                 │
                              (trim+collapse)   (charset/len/reserved)  (unicité DB)   upsert → CHECK DB
                                                        │                                     │
                                                   erreur i18n                          garde-fou ultime
```

## Gestion d'erreurs

- Validation locale échoue → message i18n inline, pas d'appel réseau.
- `isNicknameTaken` lève → `nicknameCheckFailed` (existant).
- Unicité DB violée à l'upsert → mappée sur `nicknameTaken`.
- CHECK DB violé (charset/longueur, cas de contournement direct) → l'upsert échoue ;
  l'UI affiche l'erreur générique de sauvegarde (le client valide déjà en amont, ce
  chemin ne se produit que sur contournement).

## Vérification

Pas de framework de test (`project_no_test_framework`). Vérifier via :

- `npm run check` (tsc + eslint + prettier).
- `npm run sb:migrate` puis tests SQL manuels : insertion nickname trop court /
  charset invalide / réservé / doublon → rejet ; nickname valide avec accents/espace
  → accepté.
- Runtime : formulaire settings (chaque cas d'erreur), puis navigation vers
  `/users/<nickname>` avec espaces (le fix `decodeURIComponent` couvre la résolution).

## Fichiers touchés

- `src/lib/profile/validation.ts` (nouveau)
- `supabase/migrations/<ts>_profile_field_constraints.sql` (nouveau)
- `src/app/[locale]/settings/sections/ProfileSection.tsx`
- `src/lib/profile/db/profiles.ts` (`upsertProfile`, `isNicknameTaken` sur normalisé)
- fichiers de messages i18n (toutes locales)
- `src/app/[locale]/users/[userId]/ProfileShell.tsx` — déjà corrigé (decode)
