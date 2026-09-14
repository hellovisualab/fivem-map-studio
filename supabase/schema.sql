-- FiveM Map Studio · Supabase schema
-- Run this once in the SQL editor of your Supabase project. It creates the
-- tables, RLS policies, the signup trigger and the public "assets" bucket.
-- Safe to re-run: tables use IF NOT EXISTS; drop policies first if re-creating.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null default 'Player',
  plan text not null default 'free' check (plan in ('free', 'supporter')),
  created_at timestamptz not null default now(),
  exports_today integer not null default 0,
  last_export_date text not null default to_char(now(), 'YYYY-MM-DD'),
  storage_used bigint not null default 0
);

alter table public.profiles enable row level security;

create policy "profiles: read own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles: insert own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles: update own" on public.profiles
  for update using (auth.uid() = id);

-- Auto-create a profile row whenever a user signs up (the client also does
-- this lazily on first login as a fallback).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, 'player'), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id text primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  thumbnail text,
  document jsonb not null
);

create index if not exists projects_owner_updated_idx on public.projects (owner_id, updated_at desc);

alter table public.projects enable row level security;

create policy "projects: owner full access" on public.projects
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- History
-- ---------------------------------------------------------------------------
create table if not exists public.history (
  id text primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  project_id text not null,
  project_name text not null,
  action text not null check (action in ('created', 'exported', 'imported', 'renamed', 'deleted', 'duplicated')),
  at timestamptz not null default now(),
  detail text
);

create index if not exists history_owner_at_idx on public.history (owner_id, at desc);

alter table public.history enable row level security;

create policy "history: owner full access" on public.history
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- Storage: public "assets" bucket (files live under <user_id>/...)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('assets', 'assets', true)
on conflict (id) do update set public = true;

create policy "assets: public read" on storage.objects
  for select using (bucket_id = 'assets');

create policy "assets: users upload to own folder" on storage.objects
  for insert with check (
    bucket_id = 'assets'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "assets: users manage own files" on storage.objects
  for update using (bucket_id = 'assets' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "assets: users delete own files" on storage.objects
  for delete using (bucket_id = 'assets' and auth.uid()::text = (storage.foldername(name))[1]);
