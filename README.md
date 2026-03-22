# MTG Snap

A Magic: The Gathering card collection manager. Search every printed card via the Scryfall API, track your physical copies with per-copy metadata (condition, foil type, language, tags, price), and sync your collection across devices with Supabase.

## Tech Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript** (strict)
- **Supabase** — auth (SSR) + PostgreSQL + Row-Level Security
- **Scryfall API** — card data and images (rate-limited, cached)
- **CSS Modules** — component-scoped styles, no UI library

## Quick Start

**Prerequisites:** Node.js 20+, [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started)

```bash
# 1. Install dependencies
npm install

# 2. Start the local Supabase stack
npm run sb:start

# 3. Apply DB migrations
npm run sb:reset

# 4. Copy environment variables (values from `npm run sb:status`)
cp .env.local.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY

# 5. Start the dev server
npm run dev   # http://localhost:3000
```

## Commands

| Command              | Purpose                                           |
| -------------------- | ------------------------------------------------- |
| `npm run dev`        | Dev server at localhost:3000                      |
| `npm run build`      | Production build                                  |
| `npm run check`      | TypeScript + ESLint + Prettier (read-only)        |
| `npm run check:fix`  | Auto-fix lint and format issues                   |
| `npm run sb:start`   | Start local Supabase                              |
| `npm run sb:stop`    | Stop local Supabase                               |
| `npm run sb:reset`   | **Destructive** — drop DB and re-apply migrations |
| `npm run sb:migrate` | Apply pending migrations only                     |
| `npm run sb:status`  | Show local URLs and API keys                      |
| `npm run sb:studio`  | Open Supabase Studio (port 54323)                 |
| `npm run sb:mail`    | Open auth email inbox / Inbucket (port 54324)     |

## Documentation

- [Architecture overview](docs/architecture.md)
- [Data model](docs/data-model.md)
- [Scryfall integration](docs/scryfall.md)
- [Offline sync](docs/offline-sync.md)
- [Import formats](docs/import-formats.md)
- [Local environment setup](docs/guides/local-setup.md)
- [Database migrations](docs/guides/migrations.md)
- [Adding a new import format](docs/guides/adding-import-format.md)
