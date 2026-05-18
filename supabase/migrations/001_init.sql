-- ============================================================
-- NovaStay RMS — 초기 스키마
-- Supabase SQL Editor 또는 supabase db push 로 실행
-- ============================================================

-- ── 유저 역할 열거형 ──────────────────────────────────────────
create type user_role as enum ('admin', 'manager', 'viewer');

-- ── 숙박 시설 ─────────────────────────────────────────────────
create table if not exists properties (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz default now(),
  name         text not null,
  code         text not null unique,
  timezone     text not null default 'Asia/Seoul',
  currency     text not null default 'KRW',
  total_rooms  integer not null default 0
);

-- ── 사용자 프로필 (auth.users 와 1:1) ────────────────────────
create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  created_at   timestamptz default now(),
  email        text not null,
  full_name    text,
  avatar_url   text,
  role         user_role not null default 'viewer',
  property_ids uuid[] not null default '{}'
);

-- ── 신규 유저 가입 시 프로필 자동 생성 트리거 ──────────────────
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ── RLS (Row Level Security) 활성화 ──────────────────────────
alter table profiles    enable row level security;
alter table properties  enable row level security;

-- 본인 프로필 읽기/쓰기
create policy "profiles: self read"
  on profiles for select
  using (auth.uid() = id);

create policy "profiles: self update"
  on profiles for update
  using (auth.uid() = id);

-- 관리자는 모든 프로필 읽기 가능
create policy "profiles: admin read all"
  on profiles for select
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- 숙박 시설 — 로그인 사용자 전체 읽기
create policy "properties: authenticated read"
  on properties for select
  using (auth.role() = 'authenticated');

-- 숙박 시설 — 관리자만 쓰기
create policy "properties: admin write"
  on properties for all
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ── 샘플 데이터 ───────────────────────────────────────────────
insert into properties (name, code, total_rooms) values
  ('강남점',   'GN',  120),
  ('해운대점', 'HB',   85),
  ('제주점',   'JJ',   60),
  ('명동점',   'MD',   95)
on conflict do nothing;
