# Changement d'e-mail sécurisé (validation de l'adresse actuelle d'abord) — Design

**Date** : 2026-07-13
**Statut** : validé (design), en attente relecture avant plan d'implémentation

## But

Remplacer le flux de changement d'e-mail de la section Compte de `/settings` par
un flux qui **valide d'abord l'adresse actuelle** avant d'engager quoi que ce
soit vers la nouvelle adresse, et qui envoie à l'adresse actuelle un mail
explicite « demande de changement » contenant un **lien** vers une page dédiée
où l'utilisateur saisit sa nouvelle adresse.

### Pourquoi ce chantier (contraintes découvertes)

Le flux natif Supabase ne permet pas ce séquençage :

- `auth.updateUser({ email })` avec `double_confirm_changes = true` envoie les
  deux codes (adresse actuelle + nouvelle) **simultanément** — pas de « valide
  l'ancienne d'abord ».
- Le `nonce` de `reauthenticate()` ne s'applique qu'au changement de **mot de
  passe** (cf. types `@supabase/auth-js` : _"nonce sent for reauthentication if
  the user's password is to be updated"_).
- `verifyOtp` n'expose pas de type `'reauthentication'` (`EmailOtpType` =
  `'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email'`).

Il faut donc orchestrer côté serveur : prouver le contrôle de l'adresse actuelle
via un jeton envoyé par un mail maison, puis seulement ensuite déclencher le
changement Supabase vers la nouvelle adresse.

Ce flux **remplace** la machine OTP à deux codes simultanés livrée juste avant
(commit `b3f7902`) : cette UI est retirée de `AccountSection`.

## Flux (3 étapes)

1. **Depuis `/settings`** — bouton « Changer l'e-mail » (aucun champ nouvelle
   adresse ici). Clic → `POST /api/account/email/request` → un mail maison
   « Demande de changement d'adresse e-mail » part vers l'adresse **actuelle**,
   contenant un lien `…/account/change-email?token=<token clair>`. L'UI affiche
   « Un e-mail de confirmation a été envoyé à votre adresse actuelle. »
2. **Page `/account/change-email?token=…`** (connexion requise + token valide
   lié à ce user) — l'utilisateur saisit la **nouvelle** adresse →
   `POST /api/account/email/confirm` → déclenche le changement Supabase vers la
   nouvelle adresse, qui envoie un **code de confirmation à la nouvelle
   adresse**.
3. **Saisie du code** (sur la même page) — `verifyEmailChangeOtp(newEmail, code)`
   (`verifyOtp` type `'email_change'`, helper déjà écrit) → succès → message +
   redirection `/settings`.

## Schéma DB

Nouvelle migration : table `public.email_change_requests` — jeton à usage unique
prouvant le contrôle de l'adresse actuelle.

| Colonne      | Type                                                 | Rôle                                        |
| ------------ | ---------------------------------------------------- | ------------------------------------------- |
| `id`         | `uuid` pk default `gen_random_uuid()`                |                                             |
| `user_id`    | `uuid` not null → `auth.users(id) on delete cascade` | propriétaire                                |
| `token_hash` | `text` not null                                      | SHA-256 du token (jamais le token en clair) |
| `expires_at` | `timestamptz` not null                               | expiration (30 min)                         |
| `used_at`    | `timestamptz` null                                   | usage unique                                |
| `created_at` | `timestamptz` not null default `now()`               |                                             |

- **RLS activée, AUCUNE policy** pour `anon`/`authenticated` : la table n'est
  accédée que par les routes serveur service-role. Le client n'y touche jamais.
- Le `new_email` n'est **pas** stocké : saisi à l'étape 2 et passé directement à
  Supabase.
- Index sur `token_hash` (lookup). Purge des lignes expirées/utilisées : hors
  v1 (YAGNI, pas de cron).

## Envoi SMTP

Helper serveur unique `src/lib/email/sendMail.ts` basé sur **nodemailer**
(nouvelle dépendance, la seule). On réutilise l'infra SMTP existante :

- **Dev** : SMTP local d'Inbucket (`127.0.0.1`, port Inbucket `54324`, sans
  auth) → visible dans `npm run sb:mail`.
- **Prod** : creds OVH via env (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
  `SMTP_PASS`, `SMTP_FROM`) — bloc OVH déjà prévu (commenté) dans `config.toml`.
- Sélection dev/prod : présence des env prod → OVH, sinon fallback Inbucket.

Note : Inbucket est le serveur SMTP que **GoTrue** utilise pour SES mails ; il
n'expose pas d'API « envoie ce contenu ». Un mail maison exige donc que le code
serveur ouvre lui-même une connexion SMTP (nodemailer) — vers le même serveur
qu'Inbucket en dev, OVH en prod.

Un seul template en v1 :
`src/lib/email/templates/emailChangeRequest.ts` — fonction `(link: string) =>
{ subject, html, text }`, contenu explicite « demande de changement » (pas un
mail de connexion) incluant le lien.

## Routes serveur

Deux routes API, service-role, vérifiant d'abord la session (401 si anon).

### `POST /api/account/email/request` (étape 1)

- Lit la session → `user`.
- Rate-limit : rejette s'il existe déjà une demande **non-utilisée et
  non-expirée** pour ce `user_id` (une demande active à la fois).
- Génère un token aléatoire (32 octets, base64url), stocke son **hash**
  (SHA-256) dans `email_change_requests` avec `expires_at = now() + 30 min`.
- Envoie via le helper SMTP le mail « demande de changement » à `user.email`
  (adresse **actuelle**) avec le lien `…/account/change-email?token=<clair>`.
- Répond `{ ok: true }`. Ne renvoie **jamais** le token.

### `POST /api/account/email/confirm` (étape 2)

- Lit la session → `user`. Body : `{ token, newEmail }`.
- Recalcule le hash, cherche une ligne **non-utilisée, non-expirée, du
  `user_id` courant**. Sinon `400`.
- Valide `newEmail` (format ; ≠ adresse actuelle).
- Marque `used_at = now()` (usage unique).
- Appelle `supabase.auth.updateUser({ email: newEmail })` **sur le client de
  session SSR** (pas l'API admin) → GoTrue exécute le flux de changement d'e-mail
  et envoie le **code de confirmation à la nouvelle adresse**. NB : l'API admin
  `admin.updateUserById({ email })` est une écriture administrative qui
  n'envoie AUCUN e-mail de confirmation — elle ne convient pas ici. Le client
  admin (service-role) reste néanmoins nécessaire pour lire/écrire
  `email_change_requests` (RLS activée, sans policy).
- Répond `{ ok: true }`.

### Étape 3 (client)

Réutilise `verifyEmailChangeOtp(newEmail, code)` déjà présent dans
`src/lib/supabase/auth/auth-client.ts`. Comme l'adresse actuelle est désormais
prouvée par le lien, on **désactive `double_confirm_changes`** (`config.toml`
local + prod) : un seul code part vers la nouvelle adresse.

## Front

### Page `src/app/account/change-email/page.tsx` (server)

- Garde auth (redirect `/auth/login` si anon).
- Lit `?token=` (searchParams), passe au composant client `ChangeEmailView`.
- `robots: noindex`.

### `ChangeEmailView` (client) — machine à états

- **`enter-email`** : input nouvelle adresse + « Continuer » →
  `POST /api/account/email/confirm`. Token absent/invalide → la route renvoie
  `400` → message « lien invalide ou expiré, refaites une demande ».
- **`enter-code`** : input OTP 6 chiffres (style déjà fait) →
  `verifyEmailChangeOtp(newEmail, code)` → succès → message + redirection
  `/settings`.
- Réutilise `Button` et les classes `settingsStyles`.

### `AccountSection` (dans `/settings`)

Le bloc e-mail redevient simple : input affichant l'adresse actuelle (lecture
seule) + bouton « Changer l'e-mail » → `POST /api/account/email/request` →
message « Un e-mail de confirmation a été envoyé à votre adresse actuelle. »
**Retirer** la machine OTP à deux codes livrée en `b3f7902` (états `old`/`new`,
`verifyStep`, `pendingEmail`, `cancelEmailChange`) et les inputs associés.
Les blocs mot de passe et suppression de compte restent inchangés.

## Sécurité

- Token : 32 octets aléatoires, **hashé** en DB (jamais en clair), usage unique
  (`used_at`), expiration 30 min.
- Les deux routes exigent une session (401 sinon) ET la demande doit appartenir
  au `user_id` de la session (le token seul ne suffit pas — un lien intercepté
  est inutile sans la session). La page `/account/change-email` exige aussi la
  connexion.
- `email_change_requests` : RLS activée, aucune policy → inaccessible au client,
  manipulée uniquement par les routes service-role.
- La clé service-role reste côté serveur (routes uniquement), jamais
  `NEXT_PUBLIC_`.
- Le changement effectif passe par `supabase.auth.updateUser({ email })` sur le
  client de session, qui confirme la nouvelle adresse par code (l'utilisateur
  doit aussi prouver l'accès à la nouvelle adresse).

## Vérification

Aucun framework de test (convention projet) — `npm run check` + runtime +
outils Supabase.

- `npm run check` (TS + ESLint + Prettier) doit passer.
- `npm run sb:reset` puis `npm run sb:verify` : nouvelle table → **étendre
  `supabase/verify_schema.sql`** (présence table + colonnes + types, RLS
  activée, **absence** de policy anon/authenticated, index sur `token_hash`).
- Runtime (dev, `npm run sb:mail`) : `/settings` → « Changer l'e-mail » → mail
  « demande » dans Inbucket → clic lien → page → saisir nouvelle adresse → code
  reçu sur la nouvelle adresse dans Inbucket → saisir → e-mail mis à jour,
  redirection `/settings`. Cas d'erreur : token expiré / réutilisé, nouvelle =
  actuelle, accès anon (page + routes → 401/redirect), rate-limit (2e demande
  active refusée).

## Déploiement

- Migration `email_change_requests` appliquée via le workflow prod habituel
  (SQL editor idempotent, sync `schema_migrations`).
- Config Auth prod : passer `double_confirm_changes` à `false`.
- Variables SMTP prod (`SMTP_HOST`/`PORT`/`USER`/`PASS`/`FROM`) configurées côté
  hébergement (Coolify).
