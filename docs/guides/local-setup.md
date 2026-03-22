# Local Environment Setup

## Prerequisites

- **Node.js 20+** — check with `node --version`
- **Supabase CLI** — install via `npm install -g supabase` or see the [official docs](https://supabase.com/docs/guides/cli/getting-started)
- **Docker** — required by the Supabase CLI to run the local stack

## Steps

### 1. Clone and install

```bash
git clone <repo-url>
cd scute_swarm
npm install
```

### 2. Start the local Supabase stack

```bash
npm run sb:start
```

This starts a local Supabase instance using Docker. On first run it pulls the required images — this takes a few minutes.

### 3. Apply database migrations

```bash
npm run sb:reset
```

This drops and recreates the local DB, then applies all migrations in `supabase/migrations/`. Safe to run anytime — it only affects your local instance.

### 4. Configure environment variables

Get the local API credentials:

```bash
npm run sb:status
```

Copy the output values into `.env.local` at the project root:

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from status output>
```

### 5. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Local Supabase Services

Once started, the following services are available:

| Service  | URL                    | Purpose                              |
| -------- | ---------------------- | ------------------------------------ |
| API      | http://127.0.0.1:54321 | Supabase REST + Auth API             |
| Studio   | http://127.0.0.1:54323 | DB browser and admin UI              |
| Inbucket | http://127.0.0.1:54324 | Catches auth emails (confirm, reset) |

Or use the npm shortcuts:

```bash
npm run sb:studio   # open Studio
npm run sb:mail     # open Inbucket for auth emails
```

---

## Testing Authentication

1. Register a new account at `http://localhost:3000/auth/login`
2. Open Inbucket at `http://127.0.0.1:54324` to find the confirmation email
3. Click the confirmation link to activate the account

---

## Common Issues

**Docker not running:** `npm run sb:start` will fail if Docker isn't running. Start Docker first.

**Port conflicts:** If ports 54321–54324 are in use, stop any other Supabase instances with `npm run sb:stop` before starting.

**Stale DB state:** If something is broken with the DB schema, `npm run sb:reset` will fix it by re-applying all migrations from scratch.
