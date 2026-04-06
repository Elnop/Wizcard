# CLAUDE.md

Strictly follow the rules in @AGENTS.md.

## Development Commands

- `npm run check` — TypeScript + ESLint + Prettier (run before committing)
- `npm run check:fix` — auto-fix ESLint + Prettier issues
- `npm run sb:start` / `sb:stop` / `sb:restart` — manage local Supabase
- `npm run sb:reset` — **destructive** — drop DB and re-apply all migrations
- `npm run sb:migrate` — apply pending migrations only
- `npm run sb:studio` — Supabase Studio (port 54323)
- `npm run sb:mail` — Inbucket email inbox (port 54324)
- `npm run cosmos` — React Cosmos dev server
- `supabase/bootstrap/init_schema.sql` — schema consolide pour DB vierge
