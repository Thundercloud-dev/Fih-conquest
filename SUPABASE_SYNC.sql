-- FIH Conquest: cloud-sync island development and resource stores
-- Run this entire script once in Supabase Dashboard > SQL Editor > New query.
create table if not exists public.fih_development (
  user_id uuid primary key references auth.users(id) on delete cascade,
  materials integer not null default 25 check (materials >= 0),
  buildings jsonb not null default '{}'::jsonb,
  discovered text[] not null default '{}'::text[],
  resources jsonb not null default '{"wood":0,"fish":0,"stone":0,"food":0}'::jsonb,
  last_resource_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.fih_development enable row level security;

drop policy if exists "Users can read their own development" on public.fih_development;
create policy "Users can read their own development"
  on public.fih_development for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own development" on public.fih_development;
create policy "Users can insert their own development"
  on public.fih_development for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own development" on public.fih_development;
create policy "Users can update their own development"
  on public.fih_development for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.fih_development to authenticated;
