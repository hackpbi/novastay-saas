-- ──────────────────────────────────────────────────────────────────────────────
-- 002_user_management.sql
-- User management tables: hotels, saas_menus, user_menu_permissions,
-- user_default_page, and updated profiles schema.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 1. hotels ────────────────────────────────────────────────────────────────
create table if not exists public.hotels (
  id          uuid primary key default gen_random_uuid(),
  hotel_name  text not null,
  slug        text not null unique,
  plan        text check (plan in ('standard', 'enterprise')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.hotels enable row level security;

create policy "hotels_read_all" on public.hotels
  for select using (true);

-- ── 2. profiles (updated schema) ─────────────────────────────────────────────
-- Drop and recreate with new schema if needed, or alter existing table.
-- NOTE: Run only if migrating from old schema (full_name → name, etc.)

do $$
begin
  -- Add auth_user_id if not exists
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'profiles'
                 and column_name = 'auth_user_id') then
    alter table public.profiles add column auth_user_id uuid unique references auth.users(id);
  end if;

  -- Add name if not exists (old schema used full_name)
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'profiles'
                 and column_name = 'name') then
    alter table public.profiles add column name text not null default '';
    -- Copy from full_name if it exists
    begin
      update public.profiles set name = full_name where full_name is not null;
    exception when others then null;
    end;
  end if;

  -- Add hotel_id if not exists
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'profiles'
                 and column_name = 'hotel_id') then
    alter table public.profiles add column hotel_id uuid references public.hotels(id);
  end if;

  -- Add is_active if not exists
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'profiles'
                 and column_name = 'is_active') then
    alter table public.profiles add column is_active boolean not null default true;
  end if;

  -- Add last_login_at if not exists
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'profiles'
                 and column_name = 'last_login_at') then
    alter table public.profiles add column last_login_at timestamptz;
  end if;

  -- Add updated_at if not exists
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'profiles'
                 and column_name = 'updated_at') then
    alter table public.profiles add column updated_at timestamptz not null default now();
  end if;
end $$;

-- Update role check constraint
alter table public.profiles
  drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('super_admin', 'admin', 'manager', 'staff', 'read_only'));

-- Role ↔ hotel_id constraint
alter table public.profiles
  drop constraint if exists profiles_role_hotel_check;
alter table public.profiles
  add constraint profiles_role_hotel_check check (
    (role in ('super_admin', 'admin') and hotel_id is null)
    or
    (role in ('manager', 'staff', 'read_only') and hotel_id is not null)
  );

-- ── 3. saas_menus ─────────────────────────────────────────────────────────────
create table if not exists public.saas_menus (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name        text not null,
  icon        text,
  path        text,
  menu_type   text check (menu_type in ('main', 'sub', 'setting')),
  sort_order  integer not null default 0,
  is_active   boolean not null default true
);

alter table public.saas_menus enable row level security;

create policy "saas_menus_read_all" on public.saas_menus
  for select using (true);

-- Seed default menus
insert into public.saas_menus (key, name, icon, path, menu_type, sort_order) values
  ('dashboard',     '대시보드',  'LayoutDashboard', '/dashboard',     'main', 1),
  ('rates',         '요금관리',  'Tag',             '/rates',         'main', 2),
  ('forecast',      '수요예측',  'TrendingUp',      '/forecast',      'main', 3),
  ('analytics',     '수익분석',  'BarChart2',       '/analytics',     'main', 4),
  ('channels',      '채널관리',  'Globe',           '/channels',      'main', 5),
  ('competitors',   '경쟁사분석','Users',           '/competitors',   'main', 6),
  ('reservations',  '예약현황',  'Calendar',        '/reservations',  'main', 7),
  ('reports',       '보고서',    'FileText',        '/reports',       'main', 8),
  ('notifications', '알림',      'Bell',            '/notifications', 'main', 9),
  ('settings',      '설정',      'Settings',        '/settings',      'setting', 10)
on conflict (key) do nothing;

-- ── 4. permission_level enum (used in user_menu_permissions) ──────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'permission_level') then
    create type permission_level as enum ('none', 'read', 'write', 'full');
  end if;
end $$;

-- ── 5. user_menu_permissions ──────────────────────────────────────────────────
create table if not exists public.user_menu_permissions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  menu_id     uuid not null references public.saas_menus(id) on delete cascade,
  permission  text not null default 'none'
              check (permission in ('none', 'read', 'write', 'full')),
  updated_by  uuid references public.profiles(id),
  updated_at  timestamptz not null default now(),
  unique (user_id, menu_id)
);

alter table public.user_menu_permissions enable row level security;

create policy "user_menu_permissions_read_own" on public.user_menu_permissions
  for select using (user_id = (
    select id from public.profiles where auth_user_id = auth.uid() limit 1
  ));

create policy "user_menu_permissions_admin_all" on public.user_menu_permissions
  using (exists (
    select 1 from public.profiles
    where auth_user_id = auth.uid()
    and role in ('super_admin', 'admin')
  ));

-- ── 6. user_default_page ─────────────────────────────────────────────────────
create table if not exists public.user_default_page (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references public.profiles(id) on delete cascade,
  menu_id     uuid not null references public.saas_menus(id) on delete cascade,
  updated_at  timestamptz not null default now()
);

alter table public.user_default_page enable row level security;

create policy "user_default_page_read_own" on public.user_default_page
  for select using (user_id = (
    select id from public.profiles where auth_user_id = auth.uid() limit 1
  ));

create policy "user_default_page_admin_all" on public.user_default_page
  using (exists (
    select 1 from public.profiles
    where auth_user_id = auth.uid()
    and role in ('super_admin', 'admin')
  ));

-- ── 7. Sample hotel data ──────────────────────────────────────────────────────
insert into public.hotels (hotel_name, slug, plan, is_active) values
  ('강남 NovaStay',  'gangnam',   'enterprise', true),
  ('해운대 NovaStay','haeundae',  'standard',   true),
  ('제주 NovaStay',  'jeju',      'standard',   true),
  ('명동 NovaStay',  'myeongdong','enterprise', true)
on conflict (slug) do nothing;
