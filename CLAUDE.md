# CLAUDE.md

Strictly follow the rules in @AGENTS.md.

## Development Commands

- `npm run check` — TypeScript + ESLint + Prettier (run before committing)
- `npm run check:fix` — auto-fix ESLint + Prettier issues
- `npm run sb:start` / `sb:stop` / `sb:restart` — manage local Supabase
- `npm run sb:reset` — **destructive** — drop DB and re-apply all migrations
- `npm run sb:migrate` — apply pending migrations only
- `npm run sb:verify` — audit local DB schema vs all migrations (read-only; see AGENTS.md § Schema Verification)
- `npm run sb:verify:prod` — same audit against PROD via pg-meta (needs `.env.supabase.prod`; read-only)
- `npm run seed` — seed the Scryfall catalog (`card_sets` + catalog tables) into local (or `.env.seed` target)
- `npm run seed:prod` — **writes PROD** — same seed, target read from `.env.supabase.prod` (ignores `.env.seed`)
- `npm run sb:studio` — Supabase Studio (port 54323)
- `npm run sb:mail` — Inbucket email inbox (port 54324)
- `supabase/bootstrap/init_schema.sql` — schema consolide pour DB vierge
