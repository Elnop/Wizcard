# Assets de templates — Custom Card Studio

Ce dossier héberge les frames de cartes (Magic Set Editor + CardConjurer) qui
alimentent le studio. **Son contenu est gitignoré** : le pack brut pèse ~1 Go
pour 35 030 fichiers, dont seuls ~1 580 (217 Mo) sont réellement référencés.

Les assets ne sont pas servis depuis `public/` : ils vivent dans le bucket
Supabase Storage `card-templates`, et le catalogue est la table
`public.card_templates`. Seul ce README est versionné.

## Arborescence attendue

```
assets/card-templates/
├── README.md                                    ← versionné
├── manifests/                                   ← généré, gitignoré
│   ├── templates.json
│   └── assets.json
├── card-assets/v/bcdf4190b4bf/full-magic-pack/  ← pack MSE
└── card-assets/v/2fcddba89661/cardconjurer/     ← frames CardConjurer
```

Les chemins internes sont versionnés par commit amont : un nouveau pack se pose
à côté de l'ancien, sans collision de cache CDN.

## Récupérer le pack

Sources amont :

| Pack                           | Dépôt                                 | Commit épinglé |
| ------------------------------ | ------------------------------------- | -------------- |
| Full Magic Pack                | `MagicSetEditorPacks/Full-Magic-Pack` | `bcdf4190b4bf` |
| CardConjurer (Accurate Frames) | `Investigamer/cardconjurer`           | `2fcddba89661` |

Décompresser chacun sous le chemin versionné correspondant ci-dessus.

## Pipeline

```bash
npm run card-assets:manifests   # scanne le pack → manifests/*.json
npm run card-assets:verify      # cohérence manifeste ↔ disque
npm run card-assets:upload -- --dry-run   # inventaire, aucune écriture
npm run card-assets:upload      # upload Storage + upsert card_templates
```

### Cible locale puis prod

`upload-templates.ts` résout sa cible via `resolveSupabaseEnv` :
`.env.local`, puis `.env.seed` **en override s'il existe**.

- **Local** : rien à faire, `.env.local` suffit.
- **Prod** : déposer un `.env.seed` (gitignoré) avec le `SUPABASE_URL` et le
  `SUPABASE_SERVICE_ROLE_KEY` de prod, puis relancer **la même commande**.
  Supprimer ou renommer `.env.seed` pour repointer sur le local.

Le script logge l'URL ciblée au démarrage — vérifier cette ligne avant de
laisser tourner un upload prod.

L'upload est idempotent : les objets dont la taille distante correspond déjà au
fichier local sont sautés, donc une ré-exécution ne re-téléverse que le delta.
`--force` ignore ce cache.

## Licences

Ces packs proviennent de projets tiers et **ne sont pas couverts par la licence
de ce dépôt**. Vérifier les conditions amont avant toute distribution publique
des frames — c'est la raison principale pour laquelle elles ne sont pas
committées ici.
