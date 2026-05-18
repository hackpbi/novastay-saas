-- ============================================================
-- 003_multi_hotel_user.sql
-- 유저-호텔 다대다 구조로 변경
-- Step 1~8 순서대로 실행
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- Step 0. hotel_id 컬럼에 의존하는 RLS 정책 먼저 제거
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS m03_hotel_details_rls_staff_select        ON m03_hotel_details;
DROP POLICY IF EXISTS m03_hotel_details_rls_manager_update      ON m03_hotel_details;
DROP POLICY IF EXISTS m05_audit_logs_rls_manager_select         ON m05_audit_logs;
DROP POLICY IF EXISTS m07_hotel_menu_permissions_rls_staff_select ON m07_hotel_menu_permissions;


-- ──────────────────────────────────────────────────────────────
-- Step 1. m01_profiles 변경 (hotel_id 제거)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE m01_profiles
  DROP CONSTRAINT IF EXISTS m01_profiles_fk_hotel_id;

ALTER TABLE m01_profiles
  DROP COLUMN IF EXISTS hotel_id;

ALTER TABLE m01_profiles
  DROP CONSTRAINT IF EXISTS m01_profiles_chk_admin_no_hotel;

ALTER TABLE m01_profiles
  DROP CONSTRAINT IF EXISTS m01_profiles_chk_staff_has_hotel;


-- ──────────────────────────────────────────────────────────────
-- Step 2. m08_user_menu_permissions 변경 (hotel_id 추가)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE m08_user_menu_permissions
  ADD COLUMN IF NOT EXISTS hotel_id uuid REFERENCES m02_hotels(id) ON DELETE CASCADE;

ALTER TABLE m08_user_menu_permissions
  DROP CONSTRAINT IF EXISTS m08_user_menu_permissions_uniq;

ALTER TABLE m08_user_menu_permissions
  ADD CONSTRAINT m08_user_menu_permissions_uniq
  UNIQUE (user_id, hotel_id, menu_id);

CREATE INDEX IF NOT EXISTS m08_user_menu_permissions_idx_hotel_id
  ON m08_user_menu_permissions(hotel_id);


-- ──────────────────────────────────────────────────────────────
-- Step 3. m10_profile_hotels 테이블 생성
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS m10_profile_hotels (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid        NOT NULL REFERENCES m01_profiles(id) ON DELETE CASCADE,
  hotel_id    uuid        NOT NULL REFERENCES m02_hotels(id)   ON DELETE CASCADE,
  role        text        NOT NULL DEFAULT 'staff'
              CHECK (role IN ('super_admin','admin','manager','staff','read_only')),
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT m10_profile_hotels_uniq UNIQUE (profile_id, hotel_id)
);

COMMENT ON TABLE  m10_profile_hotels            IS '유저-호텔 연결 — 1명이 여러 호텔 소속 가능';
COMMENT ON COLUMN m10_profile_hotels.role       IS '이 호텔에서의 역할 (호텔마다 다를 수 있음)';
COMMENT ON COLUMN m10_profile_hotels.profile_id IS '유저 (m01_profiles)';
COMMENT ON COLUMN m10_profile_hotels.hotel_id   IS '호텔 (m02_hotels)';


-- ──────────────────────────────────────────────────────────────
-- Step 4. m10_profile_hotels 인덱스 + updated_at 트리거
-- ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS m10_profile_hotels_idx_profile_id ON m10_profile_hotels(profile_id);
CREATE INDEX IF NOT EXISTS m10_profile_hotels_idx_hotel_id   ON m10_profile_hotels(hotel_id);
CREATE INDEX IF NOT EXISTS m10_profile_hotels_idx_role       ON m10_profile_hotels(role);

-- updated_at 자동 갱신 함수 (없으면 생성)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS m10_profile_hotels_trg_updated_at ON m10_profile_hotels;
CREATE TRIGGER m10_profile_hotels_trg_updated_at
  BEFORE UPDATE ON m10_profile_hotels
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ──────────────────────────────────────────────────────────────
-- Step 5. m10_profile_hotels RLS
-- ──────────────────────────────────────────────────────────────
ALTER TABLE m10_profile_hotels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS m10_profile_hotels_rls_select_self ON m10_profile_hotels;
CREATE POLICY m10_profile_hotels_rls_select_self
  ON m10_profile_hotels FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM m01_profiles
      WHERE auth_user_id = auth.uid()
        AND id = m10_profile_hotels.profile_id
    )
  );

DROP POLICY IF EXISTS m10_profile_hotels_rls_admin_all ON m10_profile_hotels;
CREATE POLICY m10_profile_hotels_rls_admin_all
  ON m10_profile_hotels FOR ALL
  USING (is_admin());

DROP POLICY IF EXISTS m10_profile_hotels_rls_manager_all ON m10_profile_hotels;
CREATE POLICY m10_profile_hotels_rls_manager_all
  ON m10_profile_hotels FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM m10_profile_hotels ph
      JOIN m01_profiles p ON p.id = ph.profile_id
      WHERE p.auth_user_id = auth.uid()
        AND ph.role = 'manager'
        AND ph.hotel_id = m10_profile_hotels.hotel_id
        AND ph.is_active = true
    )
  );

DROP POLICY IF EXISTS m10_profile_hotels_rls_service_role ON m10_profile_hotels;
CREATE POLICY m10_profile_hotels_rls_service_role
  ON m10_profile_hotels FOR ALL
  USING (auth.role() = 'service_role');


-- ──────────────────────────────────────────────────────────────
-- Step 6. 기존 RLS 정책 변경
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS m02_hotels_rls_staff_select_own ON m02_hotels;
CREATE POLICY m02_hotels_rls_staff_select_own
  ON m02_hotels FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM m10_profile_hotels ph
      JOIN m01_profiles p ON p.id = ph.profile_id
      WHERE p.auth_user_id = auth.uid()
        AND ph.hotel_id = m02_hotels.id
        AND ph.is_active = true
    )
  );

DROP POLICY IF EXISTS m03_hotel_details_rls_staff_select ON m03_hotel_details;
CREATE POLICY m03_hotel_details_rls_staff_select
  ON m03_hotel_details FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM m10_profile_hotels ph
      JOIN m01_profiles p ON p.id = ph.profile_id
      WHERE p.auth_user_id = auth.uid()
        AND ph.hotel_id = m03_hotel_details.hotel_id
        AND ph.is_active = true
    )
  );

DROP POLICY IF EXISTS m07_hotel_menu_permissions_rls_staff_select ON m07_hotel_menu_permissions;
CREATE POLICY m07_hotel_menu_permissions_rls_staff_select
  ON m07_hotel_menu_permissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM m10_profile_hotels ph
      JOIN m01_profiles p ON p.id = ph.profile_id
      WHERE p.auth_user_id = auth.uid()
        AND ph.hotel_id = m07_hotel_menu_permissions.hotel_id
        AND ph.is_active = true
    )
  );

DROP POLICY IF EXISTS m08_user_menu_permissions_rls_manager_all ON m08_user_menu_permissions;
CREATE POLICY m08_user_menu_permissions_rls_manager_all
  ON m08_user_menu_permissions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM m10_profile_hotels ph
      JOIN m01_profiles p ON p.id = ph.profile_id
      WHERE p.auth_user_id = auth.uid()
        AND ph.role = 'manager'
        AND ph.hotel_id = m08_user_menu_permissions.hotel_id
        AND ph.is_active = true
    )
  );


-- ──────────────────────────────────────────────────────────────
-- Step 7. is_admin() 함수 (재귀 방지, SECURITY DEFINER)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM m01_profiles
    WHERE auth_user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
  )
$$;


-- ──────────────────────────────────────────────────────────────
-- Step 8. 최종 확인
-- ──────────────────────────────────────────────────────────────
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'm%'
ORDER BY table_name;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'm01_profiles'
ORDER BY ordinal_position;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'm08_user_menu_permissions'
ORDER BY ordinal_position;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'm10_profile_hotels'
ORDER BY ordinal_position;

SELECT tablename, policyname
FROM pg_policies
WHERE tablename LIKE 'm%'
ORDER BY tablename, policyname;
