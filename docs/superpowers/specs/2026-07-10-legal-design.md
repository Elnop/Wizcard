# Légal (RGPD / LCEN) — Design (wizcard.xyz)

**Date** : 2026-07-10
**Contexte** : Wizcard est en production sur wizcard.xyz. Deuxième des quatre
chantiers « mise en production propre » (sécurité ✅ → **légal** → SEO/indexation
→ optimisation). Ce spec ne couvre que le **légal**. Cadre : **France / UE**.

## Objectif

Doter le site des documents légaux obligatoires et recommandés, accessibles
depuis toute page, avec une identité éditeur centralisée facile à faire évoluer
(passage projet perso → micro-entreprise à venir).

## Recherche — obligations applicables à Wizcard

Wizcard : comptes utilisateurs (auth **email OTP**, pas de mot de passe, pas
d'OAuth), profils publics optionnels (nickname/description/avatar), **aucun
paiement / e-commerce**, **aucun analytics/tracking tiers**, données **100 % UE**
(Supabase self-hosted + MinIO self-hosted pour les avatars + SMTP OVH pour les
OTP). APIs tierces contactées (Scryfall, Moxfield, EDHREC, Google Drive, GitHub)
reçoivent des requêtes de **données de cartes**, jamais de données perso
utilisateur.

| Document / dispositif                   | Requis ?      | Justification                                                                                                                                                                                |
| --------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mentions légales** (LCEN)             | ✅ Oui        | S'applique même aux sites perso/non commerciaux. Identifie éditeur + hébergeur.                                                                                                              |
| **Politique de confidentialité** (RGPD) | ✅ Oui        | Collecte de données perso (email, profil, IP/logs). 9 mentions obligatoires.                                                                                                                 |
| **CGU**                                 | ⚠️ Recommandé | Protège l'éditeur (contenu users, PI Wizards of the Coast). Non strictement imposé mais retenu.                                                                                              |
| **Bannière cookies bloquante**          | ❌ Non        | Seuls cookies posés = auth Supabase = **strictement nécessaires**, exemptés de consentement (confirmé CNIL). Pas de tracking. À décrire dans la politique de confidentialité, sans bannière. |
| **CGV**                                 | ❌ Non        | Aucune vente / paiement.                                                                                                                                                                     |
| **Clause transferts hors UE**           | ❌ Non        | Toutes les données perso restent en UE (self-hosted + OVH France).                                                                                                                           |

Sources : economie.gouv.fr (mentions LCEN), CNIL (RGPD communication en ligne ;
exemption cookies essentiels d'authentification), lignes directrices cookies
CNIL.

## Décision structurante — régime d'identité éditeur

**Contrainte découverte** : l'hébergement est **auto-hébergé (« home made »)**.
En droit français, l'hébergeur est celui qui stocke le site pour le public ; en
auto-hébergement, **l'éditeur est son propre hébergeur**. Le régime « éditeur
non professionnel anonyme » de la LCEN repose sur l'existence d'un hébergeur
tiers dépositaire de l'identité réelle — inapplicable ici. Un site auto-hébergé
public doit donc exposer une **identité + un contact réel joignable**.

**Décision utilisateur (régime de transition, jusqu'à la micro-entreprise)** :
afficher le pseudonyme **Elnop** + une **adresse email de contact réelle
`contact@wizcard.xyz`** + le Discord, sans adresse postale ni nom civil. La
future micro-entreprise (nom commercial + SIRET + domiciliation) régularisera
pleinement — d'où la config centralisée avec un bloc micro-entreprise en
placeholder.

**Identité retenue :**

- Éditeur & directeur de la publication : **Elnop**
- Contact : **contact@wizcard.xyz** + Discord **https://discord.gg/VkahQ2KPfA**
- Hébergeur : **auto-hébergé** (Elnop, mêmes coordonnées de contact) ; mail
  transactionnel via **OVH SAS** (2 rue Kellermann, 59100 Roubaix, France).

## Architecture

Source unique d'identité, consommée par 3 pages statiques, liées depuis un
footer global.

```
src/lib/legal/legal-config.ts        Source unique : éditeur, hébergeur,
                                     contact, Discord, traitements de données,
                                     rétention, date de MàJ. Bloc micro-entreprise
                                     en placeholder commenté.

src/app/(legal)/
  layout.tsx                         Layout commun (prose lisible, largeur
                                     contenue, lang="fr" local).
  mentions-legales/page.tsx          Mentions légales — consomme legal-config.
  confidentialite/page.tsx           Politique de confidentialité RGPD.
  cgu/page.tsx                       Conditions générales d'utilisation.

src/components/Footer/Footer.tsx     Footer GLOBAL : liens vers les 3 pages +
  src/components/Footer/Footer.module.css   Discord. Monté dans le root layout
                                     après {children}.
```

**Chaque page légale** : composant serveur statique + `generateMetadata`
(titre FR + `robots: { index: true, follow: true }` — ces pages doivent être
indexables, ce qui sert aussi le chantier SEO suivant) + affichage de la date de
dernière mise à jour issue de `legal-config`.

**Langue** : le root layout est `lang="en"`. Les pages légales sont en français.
Le layout `(legal)` enveloppe son contenu dans un conteneur `lang="fr"` (attribut
sur l'élément racine du layout) pour signaler correctement la langue aux
crawlers et lecteurs d'écran, sans toucher au `<html lang>` global (hors scope).

### `legal-config.ts` — forme

Un objet exporté typé, ex. :

```ts
export const legalConfig = {
	siteName: 'Wizcard',
	siteUrl: 'https://wizcard.xyz',
	editor: {
		name: 'Elnop', // pseudonyme (régime transition)
		publicationDirector: 'Elnop',
		contactEmail: 'contact@wizcard.xyz',
		discordUrl: 'https://discord.gg/VkahQ2KPfA',
	},
	// Bloc à activer à la création de la micro-entreprise :
	// business: { legalName, siret, address, ... }
	host: {
		selfHosted: true,
		label: 'Site auto-hébergé par l’éditeur',
		// mail transactionnel :
		mailProvider: 'OVH SAS, 2 rue Kellermann, 59100 Roubaix, France',
	},
	dataRetentionMonths: 12, // logs techniques
	lastUpdated: '2026-07-10',
} as const;
```

Les valeurs exactes de copie (numéros, adresses, dates) vivent dans ce fichier ;
les pages ne contiennent que la mise en forme + le texte rédactionnel.

## Contenu des documents

### Mentions légales

- **Éditeur** : Elnop, directeur de la publication : Elnop, contact
  contact@wizcard.xyz + Discord.
- **Hébergement** : site auto-hébergé par l'éditeur ; mail transactionnel OVH SAS
  (adresse ci-dessus).
- **Propriété intellectuelle / non-affiliation** : Magic: The Gathering et les
  noms/images de cartes sont la propriété de Wizards of the Coast ; Wizcard est
  un projet indépendant non officiel, non affilié ni approuvé par Wizards of the
  Coast (clause « fan content »).

### Politique de confidentialité (9 mentions RGPD)

1. **Responsable de traitement** : Elnop, contact@wizcard.xyz.
2. **Données collectées** : email (auth OTP) ; nickname / description / avatar
   (optionnels, fournis par l'utilisateur) ; données techniques (logs serveur,
   adresse IP).
3. **Finalités** : création et gestion du compte, authentification, affichage du
   profil public, fonctionnement du service (collections, decks), sécurité.
4. **Bases légales** : exécution du service (mesures pré-contractuelles /
   contrat) pour le compte et les données de profil ; intérêt légitime pour la
   sécurité et les logs.
5. **Destinataires** : OVH SAS (sous-traitant hébergement mail). Aucune vente ni
   partage à des fins commerciales. **Aucun transfert hors UE.**
6. **Durée de conservation** : données de compte conservées tant que le compte
   existe (jusqu'à suppression par l'utilisateur) ; logs techniques **12 mois**.
7. **Droits** (accès, rectification, effacement, portabilité, limitation,
   opposition) : exercés via contact@wizcard.xyz.
8. **Cookies** : uniquement cookies d'**authentification Supabase**, strictement
   nécessaires au fonctionnement, **exemptés de consentement** — aucun cookie de
   mesure d'audience ni de tracking, donc pas de bannière. Décrits ici.
9. **Réclamation** : droit d'introduire une réclamation auprès de la **CNIL**
   (www.cnil.fr).

### CGU

- **Objet** : service gratuit de gestion de collection et de decks Magic: The
  Gathering.
- **Compte** : email requis (OTP) ; l'utilisateur est responsable du contenu
  qu'il publie (nickname, description, avatar, cartes personnalisées).
- **Propriété intellectuelle** : cf. clause Wizards of the Coast + non-affiliation.
- **Contenu utilisateur** : l'éditeur peut retirer tout contenu illicite ;
  l'utilisateur garantit disposer des droits sur ses uploads.
- **Responsabilité** : service fourni « en l'état », sans garantie de
  disponibilité ni d'absence d'erreurs.
- **Contact / droit applicable** : contact@wizcard.xyz + Discord ; droit français.

## Hors périmètre (notés)

- **Action ops (prérequis mise en prod)** : créer / rediriger la boîte
  **contact@wizcard.xyz** côté OVH (l'adresse doit être réelle et relevée — c'est
  le canal légal + exercice des droits RGPD).
- **À régulariser à la création de la micro-entreprise** : activer le bloc
  `business` de `legal-config.ts` (nom commercial, SIRET, adresse de
  domiciliation, TVA le cas échéant) → bascule automatique des mentions légales
  vers le régime professionnel.
- **Registre des traitements RGPD** : recommandé mais interne (non publié) —
  hors scope de ce chantier front.
- SEO / optimisation → specs dédiés (le `robots: index` posé ici sert déjà le SEO).

## Contraintes

- **Français** pour tout le contenu légal.
- **Statique** (pas de CMS — YAGNI). Contenu rédigé en dur dans les pages, valeurs
  d'identité centralisées dans `legal-config.ts`.
- **Pas de bannière cookies** (auth = cookies essentiels exemptés).
- **Pas de nouvelle dépendance npm.**
- Suivre les conventions existantes (CSS Modules, composants serveur par défaut,
  `generateMetadata` comme `card/[id]` et `sets/[code]`).
- Toutes les valeurs de copie exactes vivent dans `legal-config.ts`.

## Vérification

Pas de framework de test (cf. `project_no_test_framework`). Validation via :

- `npm run check` (tsc + eslint + prettier)
- Runtime : les 3 pages rendent en FR, la date de MàJ s'affiche, le footer global
  apparaît sur toutes les pages avec les 3 liens + Discord fonctionnels,
  `generateMetadata` produit titre + `robots: index` (vérifiable via view-source /
  `curl`).
- Cohérence : modifier une valeur dans `legal-config.ts` (ex. contactEmail) se
  répercute sur les 3 pages.
