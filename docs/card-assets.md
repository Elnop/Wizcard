# Custom-card asset pack

Wizcard vendors the complete `Full-Magic-Pack` payload under a commit-addressed
directory:

```text
public/card-assets/
├── manifests/
│   ├── templates.json
│   └── assets.json
└── v/bcdf4190b4bf/full-magic-pack/
    ├── data/
    └── fonts/
```

The original MSE layout is preserved because style packages reference shared
includes by their package directory name. The upstream snapshot is commit
`bcdf4190b4bf` from `MagicSetEditorPacks/Full-Magic-Pack` and was imported with
explicit collaborator permission.

## Runtime and caching

The Studio loads only `templates.json` at startup, then lazily loads the selected
template preview and frame assets. Next.js serves the pack from `public/`; the
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

`templates.json` indexes every `.mse-style` package for the editor. `assets.json`
indexes every file in the snapshot for completeness and deployment audits.

This is an unofficial project. Magic: The Gathering and related marks belong to
Wizards of the Coast. Preserve the bundled upstream README and do not republish
individual third-party assets without checking their attached rights.
