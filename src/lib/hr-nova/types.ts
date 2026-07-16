export type HotelGrade = '5성급' | '4성급' | '3성급' | '2성급' | '1성급' | '기타';
export type DeptId = 'exec'|'admin'|'finance'|'it'|'facility'|'canteen'|'sales'|'room'|'fb'|'kitchen';

export interface Hotel {
  id: string;
  hotel_name: string;
  hotel_grade: HotelGrade;
  hotel_location?: string;
  total_rooms: number;
  total_staff: number;
  analysis_year: number;
  created_at?: string;
  updated_at?: string;
}

// 손익 계산 결과 (원본 state.result 그대로)
export interface PlResult {
  totalRevenue: number;
  roomRev: number;
  fbTotal: number;
  otherRev: number;
  nonOpIncome: number;
  roomRevRatio: number;
  // 객실 KPI
  occ: number;
  adr: number;
  revpar: number;
  avail: number;
  sold: number;
  // 인건비
  salary: number;
  allowance: number;
  retirement: number;
  welfare: number;
  outsourcing: number;
  insTotal: number;
  totalLabor: number;
  // 고정비
  totalTaxFees: number;
  totalAdmin: number;
  // 변동비
  totalVariable: number;
  // 영업외
  totalNonOp: number;
  // 손익
  totalCost: number;
  operatingProfit: number;
  netIncome: number;
  // 비율
  laborRatio: number;
  opMargin: number;
  netMargin: number;
}

// 전체 입력값 (원본 saveData의 allInputIds 그대로)
export interface PlInput {
  // 객실
  r_available: number;
  r_sold: number;
  r_adr: number;
  r_revenue: number;
  // F&B 10개
  fb_breakfast: number; fb_main_restaurant: number; fb_korean: number;
  fb_chinese: number; fb_japanese: number; fb_western: number;
  fb_deli: number; fb_lounge: number; fb_banquet: number; fb_other: number;
  // 기타수입 7개
  other_minibar: number; other_laundry: number; other_biz: number;
  other_fitness: number; other_space: number; other_rent: number; other_misc: number;
  // 영업외수익
  non_op_income_interest: number; non_op_income_fx: number; non_op_income_other: number;
  // 인건비
  l_salary: number; l_allowance: number; l_retirement: number;
  l_welfare: number; l_outsourcing: number;
  // 고정비
  f_utilities: number; f_insurance: number; f_tax: number; f_envfee: number;
  f_rent: number; f_lease: number; f_depreciation: number; f_intangible: number;
  // 변동비
  v_food: number; v_beverage: number; v_material_other: number;
  v_promotion: number; v_advertising: number; v_commission: number;
  v_supplies: number; v_maintenance: number; v_laundry_cost: number;
  v_travel: number; v_communication: number; v_education: number;
  v_crockery: number; v_linen: number; v_misc: number;
  // 영업외비용
  nop_interest: number; nop_fx: number; nop_other: number;
  nop_disposal: number; nop_tax: number;
}

export const EMPTY_INPUT: PlInput = {
  r_available:0, r_sold:0, r_adr:0, r_revenue:0,
  fb_breakfast:0, fb_main_restaurant:0, fb_korean:0, fb_chinese:0, fb_japanese:0,
  fb_western:0, fb_deli:0, fb_lounge:0, fb_banquet:0, fb_other:0,
  other_minibar:0, other_laundry:0, other_biz:0, other_fitness:0,
  other_space:0, other_rent:0, other_misc:0,
  non_op_income_interest:0, non_op_income_fx:0, non_op_income_other:0,
  l_salary:0, l_allowance:0, l_retirement:0, l_welfare:0, l_outsourcing:0,
  f_utilities:0, f_insurance:0, f_tax:0, f_envfee:0,
  f_rent:0, f_lease:0, f_depreciation:0, f_intangible:0,
  v_food:0, v_beverage:0, v_material_other:0, v_promotion:0, v_advertising:0,
  v_commission:0, v_supplies:0, v_maintenance:0, v_laundry_cost:0,
  v_travel:0, v_communication:0, v_education:0, v_crockery:0, v_linen:0, v_misc:0,
  nop_interest:0, nop_fx:0, nop_other:0, nop_disposal:0, nop_tax:0,
};
