-- TI4 Companion App — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run

-- ── Games table ──────────────────────────────────────────────────────────────
create table if not exists public.games (
  id         uuid primary key default gen_random_uuid(),
  code       text unique not null,           -- 6-char room code e.g. "TI4KX7"
  state      jsonb not null default '{}',    -- full game state blob
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Index on code for fast lookups
create index if not exists games_code_idx on public.games (code);

-- Auto-update updated_at on any row change
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists games_updated_at on public.games;
create trigger games_updated_at
  before update on public.games
  for each row execute function public.set_updated_at();

-- ── Row-level security ────────────────────────────────────────────────────────
-- Enable RLS
alter table public.games enable row level security;

-- Allow anyone with the anon key to read any game (by code)
create policy "Anyone can read games"
  on public.games for select
  using (true);

-- Allow anyone with the anon key to insert a new game
create policy "Anyone can create a game"
  on public.games for insert
  with check (true);

-- Allow anyone with the anon key to update any game
-- (trust is handled at the app level via host permissions)
create policy "Anyone can update games"
  on public.games for update
  using (true);

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- Enable realtime on the games table
-- (You also need to enable this in: Supabase Dashboard → Database → Replication → Source → games)
alter publication supabase_realtime add table public.games;

-- ── Auto-cleanup old games ────────────────────────────────────────────────────
-- Optional: delete games older than 7 days to keep the DB tidy
-- Run this as a scheduled job in Supabase → Edge Functions, or manually.
-- delete from public.games where created_at < now() - interval '7 days';
