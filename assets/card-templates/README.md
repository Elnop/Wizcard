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

Une seule commande : génération du manifeste, contrôles, upload Storage et
upsert du catalogue sont les étapes d'un même geste.

```bash
npm run card-assets -- --dry-run   # inventaire + contrôles, aucune écriture
npm run card-assets                # exécute tout
```

Options : `--skip-manifests` réutilise le manifeste existant (évite un rescan
du pack, ~30 s) ; `--force` re-téléverse même les objets déjà à jour.

### Cible : local puis prod

Le script suit `resolveSupabaseEnv` — `.env.local`, puis `.env.seed` **en
override s'il existe**. La bascule se fait par ce fichier, pas par un flag :

- **Local** : pas de `.env.seed` (ou renommé), `.env.local` suffit.
- **Prod** : déposer `.env.seed` (gitignoré) avec les `SUPABASE_URL` et
  `SUPABASE_SERVICE_ROLE_KEY` de prod, puis relancer la même commande.

⚠️ **`.env.seed` gagne toujours.** S'il contient les creds de prod, la commande
écrit en prod. Le script logge l'URL ciblée dès la première ligne, et ajoute un
`WARN` explicite quand la cible n'est pas locale — lire cette ligne avant de
laisser tourner. En cas de doute, `--dry-run` affiche la cible sans rien écrire.

L'upload est idempotent : les objets dont la taille distante correspond déjà au
fichier local sont sautés, donc une ré-exécution ne re-téléverse que le delta.

## Licences

Ces packs proviennent de projets tiers et **ne sont pas couverts par la licence
de ce dépôt**. Vérifier les conditions amont avant toute distribution publique
des frames — c'est la raison principale pour laquelle elles ne sont pas
committées ici.
