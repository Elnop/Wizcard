-- One-time tokens proving control of a user's CURRENT email address, used by
-- the secure email-change flow. RLS is enabled with NO policy: the table is
-- reachable only by the service-role routes (which bypass RLS), never the
-- client. Idempotent for the prod SQL-editor workflow.

create table if not exists public.email_change_requests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists email_change_requests_token_hash_idx
  on public.email_change_requests (token_hash);

create index if not exists email_change_requests_user_id_idx
  on public.email_change_requests (user_id);

alter table public.email_change_requests enable row level security;
-- Deliberately no policy: service-role only.
