# Custom-card asset pack

Wizcard vendors the complete `Full-Magic-Pack` payload and CardConjurer's curated
`Accurate Frames` group under commit-addressed directories:

```text
public/card-assets/
├── manifests/
│   ├── templates.json
│   └── assets.json
└── v/
    ├── bcdf4190b4bf/full-magic-pack/
    │   ├── data/
    │   └── fonts/
    └── 2fcddba89661/cardconjurer/
        ├── img/frames/m15/new/
        └── js/frames/
```

The original MSE layout is preserved because style packages reference shared
includes by their package directory name. The upstream snapshot is commit
`bcdf4190b4bf` from `MagicSetEditorPacks/Full-Magic-Pack` and was imported with
explicit collaborator permission.

The CardConjurer snapshot is commit `2fcddba89661` from
`Investigamer/cardconjurer`. It contains the upstream `Accurate Frames` selection:
M15 regular, extended art, full art, snow, Nyx and Universes Beyond. Those
2010 × 2814 frames are the Studio's recommended defaults. The upstream pack files
are retained next to the images as provenance and as the source of the frame
geometry.

## Runtime and caching

The Studio loads only `templates.json` at startup, then lazily loads a small
thumbnail and the selected frame asset. Next.js serves the packs from `public/`; the
versioned files receive `Cache-Control: public, max-age=31536000, immutable`.
Cloudflare should use a Cache Rule for `/card-assets/v/*` with cache eligibility
enabled and a one-year Edge TTL. Manifests keep a five-minute TTL.

The immutable path avoids cache purges. A new upstream import must use a new
version folder instead of modifying an existing snapshot.

## Maintenance

```sh
npm run card-assets:manifest
npm run card-assets:verify
```

`templates.json` indexes the six curated CardConjurer layouts before every usable
`.mse-style` package. MSE sample-only packages remain indexed for provenance but
are deliberately hidden in the frame picker: a sample image must never be
stretched into a card frame. `assets.json` indexes every file in both snapshots
for completeness and deployment audits.

This is an unofficial project. Magic: The Gathering and related marks belong to
Wizards of the Coast. Preserve the bundled upstream README and do not republish
individual third-party assets without checking their attached rights.
