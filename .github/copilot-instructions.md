# GitHub Copilot Instructions — scute_swarm

See `AGENTS.md` at the project root for complete project context (architecture, key files, data model, dev commands).

## Stack

- Next.js 16 App Router, TypeScript strict mode (`@/*` → `./src/*`)
- React Compiler **disabled**
- Supabase (auth + database, RLS scoped to `auth.uid() = owner_id`)
- CSS Modules per component
- Prettier: tabs (width 2), single quotes, trailing commas es5

## Critical Pitfalls

- **Never group by `scryfallId`** for display — use `oracleId` via `CardStack`
- **Never call `fetch()` against Scryfall directly** — use `scryfallGet`/`scryfallPost` from `src/lib/scryfall/fetcher.ts`
- **Always call `triggerSync()` after `enqueue()`** — the queue does not self-start
- **`npm run sb:reset` is destructive** — drops and recreates the local DB
- **Provider nesting order in `src/contexts/Providers.tsx` is load-bearing** — do not reorder without auditing
- **Write the current localStorage format**: `{ scryfallId: string, entry: CardEntry }`
