-- ============================================================
-- 004_auto_deactivate_promotions.sql
-- 만료 프로모션 자동 비활성화 RPC
--   s03_rate_promotion.status: 'active' | 'inactive' (text)
--   stay_end / sale_end < KST 오늘 인 active 프로모션을 inactive 로 전환
-- 호출: 페이지 진입 시 supabase.rpc('auto_deactivate_promotions', { p_hotel_id })
-- ============================================================

CREATE OR REPLACE FUNCTION auto_deactivate_promotions(p_hotel_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Seoul')::date;
BEGIN
  UPDATE s03_rate_promotion
  SET status = 'inactive'
  WHERE hotel_id = p_hotel_id
    AND status = 'active'
    AND (
      -- 투숙 종료일이 오늘 이전이거나
      (stay_end IS NOT NULL AND stay_end < v_today)
      OR
      -- 판매 종료일이 오늘 이전인 경우
      (sale_end IS NOT NULL AND sale_end < v_today)
    );
END;
$$;
