import { supabase } from '@/lib/supabase';

const db = (table: string) => (supabase as any).from(table);

// ── 호텔 ──────────────────────────────────────────────────
export const fetchHotels = async () => {
  const { data, error } = await db('h01_hotels').select('*').order('hotel_name');
  if (error) throw error;
  return data ?? [];
};
export const upsertHotel = async (row: Record<string,unknown>) => {
  const { data, error } = await db('h01_hotels').upsert(row, {onConflict:'id'}).select().single();
  if (error) throw error;
  return data;
};
export const deleteHotel = async (id: string) => {
  const { error } = await db('h01_hotels').delete().eq('id', id);
  if (error) throw error;
};

// ── 매출 ──────────────────────────────────────────────────
export const fetchRevenue = async (hotelId: string, year: number) => {
  const { data, error } = await db('h02_revenue').select('*')
    .eq('hotel_id', hotelId).eq('analysis_year', year).maybeSingle();
  if (error) throw error;
  return data;
};
export const upsertRevenue = async (row: Record<string,unknown>) => {
  const { error } = await db('h02_revenue').upsert(row, {onConflict:'hotel_id,analysis_year'});
  if (error) throw error;
};

// ── 인건비 ────────────────────────────────────────────────
export const fetchLaborCost = async (hotelId: string, year: number) => {
  const { data, error } = await db('h03_labor_cost').select('*')
    .eq('hotel_id', hotelId).eq('analysis_year', year).maybeSingle();
  if (error) throw error;
  return data;
};
export const upsertLaborCost = async (row: Record<string,unknown>) => {
  const { error } = await db('h03_labor_cost').upsert(row, {onConflict:'hotel_id,analysis_year'});
  if (error) throw error;
};

// ── 부서별 인건비 ──────────────────────────────────────────
export const fetchDeptLabor = async (hotelId: string, year: number) => {
  const { data, error } = await db('h04_dept_labor').select('*')
    .eq('hotel_id', hotelId).eq('analysis_year', year);
  if (error) throw error;
  return data ?? [];
};
export const upsertDeptLabor = async (rows: Record<string,unknown>[]) => {
  const { error } = await db('h04_dept_labor').upsert(rows, {onConflict:'hotel_id,analysis_year,dept'});
  if (error) throw error;
};

// ── 부서×직급 연봉 테이블 ────────────────────────────────
export const fetchDeptSalary = async (hotelId: string) => {
  const { data, error } = await db('h05_dept_salary_table').select('*').eq('hotel_id', hotelId);
  if (error) throw error;
  return data ?? [];
};
export const upsertDeptSalary = async (rows: Record<string,unknown>[]) => {
  const { error } = await db('h05_dept_salary_table').upsert(rows, {onConflict:'hotel_id,dept,grade'});
  if (error) throw error;
};

// ── 고정비 ────────────────────────────────────────────────
export const fetchFixedCost = async (hotelId: string, year: number) => {
  const { data, error } = await db('h06_fixed_cost').select('*')
    .eq('hotel_id', hotelId).eq('analysis_year', year).maybeSingle();
  if (error) throw error;
  return data;
};
export const upsertFixedCost = async (row: Record<string,unknown>) => {
  const { error } = await db('h06_fixed_cost').upsert(row, {onConflict:'hotel_id,analysis_year'});
  if (error) throw error;
};

// ── 변동비 ────────────────────────────────────────────────
export const fetchVariableCost = async (hotelId: string, year: number) => {
  const { data, error } = await db('h07_variable_cost').select('*')
    .eq('hotel_id', hotelId).eq('analysis_year', year).maybeSingle();
  if (error) throw error;
  return data;
};
export const upsertVariableCost = async (row: Record<string,unknown>) => {
  const { error } = await db('h07_variable_cost').upsert(row, {onConflict:'hotel_id,analysis_year'});
  if (error) throw error;
};

// ── 영업외비용 ────────────────────────────────────────────
export const fetchNonOpCost = async (hotelId: string, year: number) => {
  const { data, error } = await db('h09_non_operating_cost').select('*')
    .eq('hotel_id', hotelId).eq('analysis_year', year).maybeSingle();
  if (error) throw error;
  return data;
};
export const upsertNonOpCost = async (row: Record<string,unknown>) => {
  const { error } = await db('h09_non_operating_cost').upsert(row, {onConflict:'hotel_id,analysis_year'});
  if (error) throw error;
};

// ── 손익 결과 ─────────────────────────────────────────────
export const fetchPlResult = async (hotelId: string, year: number) => {
  const { data, error } = await db('h10_pl_result').select('*')
    .eq('hotel_id', hotelId).eq('analysis_year', year).maybeSingle();
  if (error) throw error;
  return data;
};
export const upsertPlResult = async (row: Record<string,unknown>) => {
  const { error } = await db('h10_pl_result').upsert(
    {...row, calculated_at: new Date().toISOString()},
    {onConflict:'hotel_id,analysis_year'}
  );
  if (error) throw error;
};

// ── 전체 데이터 한 번에 조회 (모든 입력 페이지 저장 후 호출) ─
export const fetchAllInputs = async (hotelId: string, year: number) => {
  const [rev, lab, fix, vari, nonOp] = await Promise.all([
    fetchRevenue(hotelId, year),
    fetchLaborCost(hotelId, year),
    fetchFixedCost(hotelId, year),
    fetchVariableCost(hotelId, year),
    fetchNonOpCost(hotelId, year),
  ]);
  return { rev, lab, fix, vari, nonOp };
};

// ── 월별 비용 추이 ────────────────────────────────────────
export const fetchMonthly = async (hotelId: string, year: number) => {
  const { data, error } = await db('h11_monthly_cost').select('*')
    .eq('hotel_id', hotelId).eq('analysis_year', year).order('month');
  if (error) throw error;
  return data ?? [];
};
export const upsertMonthly = async (rows: Record<string,unknown>[]) => {
  const { error } = await db('h11_monthly_cost').upsert(rows, {onConflict:'hotel_id,analysis_year,month'});
  if (error) throw error;
};

// ── 연간 예산 ─────────────────────────────────────────────
export const fetchBudget = async (hotelId: string, year: number) => {
  const { data, error } = await db('h12_budget_annual').select('*')
    .eq('hotel_id', hotelId).eq('budget_year', year).maybeSingle();
  if (error) throw error;
  return data;
};
export const upsertBudget = async (row: Record<string,unknown>) => {
  const { error } = await db('h12_budget_annual').upsert(row, {onConflict:'hotel_id,budget_year'});
  if (error) throw error;
};

// ── 예산 월별 ─────────────────────────────────────────────
export const fetchBudgetMonthly = async (hotelId: string, year: number) => {
  const { data, error } = await db('h13_budget_monthly').select('*')
    .eq('hotel_id', hotelId).eq('budget_year', year);
  if (error) throw error;
  return data ?? [];
};
export const upsertBudgetMonthly = async (rows: Record<string,unknown>[]) => {
  const { error } = await db('h13_budget_monthly').upsert(rows, {onConflict:'hotel_id,budget_year,category,month'});
  if (error) throw error;
};

// ── 경고 이력 ─────────────────────────────────────────────
export const fetchWarnings = async (hotelId: string) => {
  const { data, error } = await db('h14_warning_history').select('*')
    .eq('hotel_id', hotelId).order('snapshot_at', {ascending:false}).limit(200);
  if (error) throw error;
  return data ?? [];
};
export const insertWarning = async (row: Record<string,unknown>) => {
  const { error } = await db('h14_warning_history').insert(row);
  if (error) throw error;
};

// ── 전년도 비교 ───────────────────────────────────────────
export const fetchLastYear = async (hotelId: string, year: number) => {
  const { data, error } = await db('h15_last_year_compare').select('*')
    .eq('hotel_id', hotelId).eq('analysis_year', year).maybeSingle();
  if (error) throw error;
  return data;
};
export const upsertLastYear = async (row: Record<string,unknown>) => {
  const { error } = await db('h15_last_year_compare').upsert(row, {onConflict:'hotel_id,analysis_year'});
  if (error) throw error;
};
