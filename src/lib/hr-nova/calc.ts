import { INS_RATES, RETIRE_RATE } from './constants';
import type { PlInput, PlResult } from './types';

// ── 숫자 포맷 (원본 fmt / fmtFull 그대로) ──────────────────
export function fmt(n: number): string {
  if (!n || isNaN(n)) return '0';
  const abs = Math.abs(n);
  if (abs >= 100000000) return (n / 100000000).toFixed(1) + '억';
  if (abs >= 10000000)  return Math.round(n / 10000000) + '천만';
  if (abs >= 10000)     return Math.round(n / 10000) + '만';
  return n.toLocaleString('ko-KR');
}
export function fmtFull(n: number): string {
  if (!n || isNaN(n)) return '₩ 0';
  return '₩ ' + Math.round(n).toLocaleString('ko-KR');
}
export function fmtPct(n: number): string { return (n || 0).toFixed(1) + '%'; }
export function fmtK(n: number): string { return Math.round((n||0)/1000).toLocaleString('ko-KR') + 'K'; }

// ── 4대보험 자동 계산 (원본 calcLabor 내 로직 그대로) ────────
export interface InsResult {
  pension: number; health: number; ltc: number;
  employ: number; accident: number; total: number;
}
export function calcInsurance(salary: number): InsResult {
  const pension  = salary * 0.0475;
  const health   = salary * 0.03545;   // 원본: 0.03545
  const ltc      = health * 0.1314 / 2;
  const employ   = salary * 0.014;
  const accident = salary * 0.011;
  return { pension, health, ltc, employ, accident, total: pension+health+ltc+employ+accident };
}

// ── 부서별 인건비 계산 함수들 (원본 그대로) ──────────────────
export function getMonthlySalary(annualWan: number): number {
  return Math.round(annualWan * 10000 / 12);
}
export function getMonthlyIns(annualWan: number): number {
  const monthly = getMonthlySalary(annualWan);
  const health  = monthly * (INS_RATES.health / 100);
  const ltc     = health * 13.14 / 2 / 100;
  return Math.round(
    monthly * (INS_RATES.pension + INS_RATES.health + INS_RATES.employ + INS_RATES.accident) / 100 + ltc
  );
}
export function getMonthlyRetirement(annualWan: number): number {
  return Math.round(annualWan * 10000 * RETIRE_RATE / 100 / 12);
}
export function getMonthlyTotal(annualWan: number): number {
  return getMonthlySalary(annualWan) + getMonthlyIns(annualWan) + getMonthlyRetirement(annualWan);
}

// ── 객실 매출 계산 (원본 calcRevenue 그대로) ─────────────────
export function calcRevenue(sold: number, adr: number): number {
  return sold * adr;
}

// ── 손익 전체 계산 (원본 autoCalc 그대로) ───────────────────
export function calcPl(inp: PlInput): PlResult {
  // F&B 합계
  const fbTotal = inp.fb_breakfast + inp.fb_main_restaurant + inp.fb_korean +
                  inp.fb_chinese + inp.fb_japanese + inp.fb_western +
                  inp.fb_deli + inp.fb_lounge + inp.fb_banquet + inp.fb_other;
  // 기타수입
  const otherRev = inp.other_minibar + inp.other_laundry + inp.other_biz +
                   inp.other_fitness + inp.other_space + inp.other_rent + inp.other_misc;
  // 영업외수익
  const nonOpIncome = inp.non_op_income_interest + inp.non_op_income_fx + inp.non_op_income_other;
  // 총 매출
  const totalRevenue = inp.r_revenue + fbTotal + otherRev + nonOpIncome;
  const roomRevRatio = totalRevenue > 0 ? inp.r_revenue / totalRevenue * 100 : 0;

  // 4대보험 (원본 calcLabor 그대로)
  const ins = calcInsurance(inp.l_salary);
  const totalLabor = inp.l_salary + inp.l_allowance + inp.l_retirement +
                     inp.l_welfare + inp.l_outsourcing + ins.total;

  // 고정비
  const totalTaxFees = inp.f_utilities + inp.f_insurance + inp.f_tax + inp.f_envfee;
  const totalAdmin   = inp.f_rent + inp.f_lease + inp.f_depreciation + inp.f_intangible;

  // 변동비
  const totalVariable = inp.v_food + inp.v_beverage + inp.v_material_other +
                        inp.v_promotion + inp.v_advertising + inp.v_commission +
                        inp.v_supplies + inp.v_maintenance + inp.v_laundry_cost +
                        inp.v_travel + inp.v_communication + inp.v_education +
                        inp.v_crockery + inp.v_linen + inp.v_misc;

  // 영업외비용
  const totalNonOp = inp.nop_interest + inp.nop_fx + inp.nop_other + inp.nop_disposal + inp.nop_tax;

  // 손익 (원본 그대로)
  const totalCost       = totalLabor + totalTaxFees + totalAdmin + totalVariable + totalNonOp;
  const operatingProfit = totalRevenue - totalLabor - totalTaxFees - totalAdmin - totalVariable;
  const netIncome       = operatingProfit - totalNonOp;

  // 비율
  const laborRatio = totalRevenue > 0 ? totalLabor / totalRevenue * 100 : 0;
  const opMargin   = totalRevenue > 0 ? operatingProfit / totalRevenue * 100 : 0;
  const netMargin  = totalRevenue > 0 ? netIncome / totalRevenue * 100 : 0;

  // 객실 KPI
  const occ   = inp.r_available > 0 ? inp.r_sold / inp.r_available * 100 : 0;
  const revpar = inp.r_available > 0 ? inp.r_revenue / inp.r_available : 0;

  return {
    totalRevenue, roomRev:inp.r_revenue, fbTotal, otherRev, nonOpIncome, roomRevRatio,
    occ, adr:inp.r_adr, revpar, avail:inp.r_available, sold:inp.r_sold,
    salary:inp.l_salary, allowance:inp.l_allowance, retirement:inp.l_retirement,
    welfare:inp.l_welfare, outsourcing:inp.l_outsourcing, insTotal:ins.total,
    totalLabor, totalTaxFees, totalAdmin, totalVariable, totalNonOp,
    totalCost, operatingProfit, netIncome, laborRatio, opMargin, netMargin,
  };
}

// ── DB 데이터 → PlInput 변환 헬퍼 ────────────────────────────
export function buildPlInput(
  rev: Record<string,number>|null,
  lab: Record<string,number>|null,
  fix: Record<string,number>|null,
  vari: Record<string,number>|null,
  nonOp: Record<string,number>|null,
): PlInput {
  const n = (obj: Record<string,number>|null, key: string) => Number(obj?.[key] || 0);
  return {
    r_available: n(rev,'sold_rooms') > 0 ? n(rev,'sold_rooms') / (n(rev,'occ_pct')/100||1) : 0,
    r_sold: n(rev,'sold_rooms'), r_adr: n(rev,'adr'), r_revenue: n(rev,'room_revenue'),
    fb_breakfast:n(rev,'fb_breakfast'), fb_main_restaurant:n(rev,'fb_main_restaurant'),
    fb_korean:n(rev,'fb_korean'), fb_chinese:n(rev,'fb_chinese'), fb_japanese:n(rev,'fb_japanese'),
    fb_western:n(rev,'fb_western'), fb_deli:n(rev,'fb_deli'), fb_lounge:n(rev,'fb_lounge'),
    fb_banquet:n(rev,'fb_banquet'), fb_other:n(rev,'fb_other'),
    other_minibar:n(rev,'other_minibar'), other_laundry:n(rev,'other_laundry'), other_biz:n(rev,'other_biz'),
    other_fitness:n(rev,'other_fitness'), other_space:n(rev,'other_space'), other_rent:n(rev,'other_rent'), other_misc:n(rev,'other_misc'),
    non_op_income_interest:n(rev,'non_op_income_interest'), non_op_income_fx:n(rev,'non_op_income_fx'), non_op_income_other:n(rev,'non_op_income_other'),
    l_salary:n(lab,'salary'), l_allowance:n(lab,'allowance'), l_retirement:n(lab,'severance'),
    l_welfare:n(lab,'welfare'), l_outsourcing:n(lab,'outsourcing'),
    f_utilities:n(fix,'utilities_basic'), f_insurance:n(fix,'insurance'), f_tax:n(fix,'tax_basic'), f_envfee:n(fix,'envfee'),
    f_rent:n(fix,'rent'), f_lease:n(fix,'lease'), f_depreciation:n(fix,'depreciation'), f_intangible:n(fix,'intangible'),
    v_food:n(vari,'food'), v_beverage:n(vari,'beverage'), v_material_other:n(vari,'material_other'),
    v_promotion:n(vari,'promotion'), v_advertising:n(vari,'advertising'), v_commission:n(vari,'commission'),
    v_supplies:n(vari,'supplies'), v_maintenance:n(vari,'maintenance'), v_laundry_cost:n(vari,'laundry'),
    v_travel:n(vari,'travel_var'), v_communication:n(vari,'communication'), v_education:n(vari,'education_var'),
    v_crockery:n(vari,'crockery'), v_linen:n(vari,'linen'), v_misc:n(vari,'utilities_var'),
    nop_interest:n(nonOp,'interest'), nop_fx:n(nonOp,'fx_loss'), nop_other:n(nonOp,'other'),
    nop_disposal:n(nonOp,'disposal'), nop_tax:n(nonOp,'corp_tax'),
  };
}

// ── 인건비 진단 (원본 getLaborDiagnosis 그대로) ──────────────
export function getLaborDiag(ratio: number): {text:string, color:'success'|'warning'|'danger', badge:string} {
  if (ratio === 0) return {text:'-', color:'success', badge:'-'};
  if (ratio < 25)  return {text:'매우 우수 ✅', color:'success', badge:'매우우수'};
  if (ratio < 30)  return {text:'양호 👍', color:'success', badge:'양호'};
  if (ratio < 35)  return {text:'주의 필요 ⚠️', color:'warning', badge:'주의'};
  if (ratio < 40)  return {text:'개선 필요 🔶', color:'danger', badge:'개선필요'};
  return               {text:'위험 🚨 즉시 개선', color:'danger', badge:'위험'};
}

// ── 시나리오 계산 (원본 calcScenario 그대로) ─────────────────
export function calcScenario(r: PlResult, pcts = [-20,-15,-10,-5,0,5,10,15,20]) {
  return pcts.map(pct => {
    const newLabor  = r.totalLabor * (1 + pct/100);
    const newProfit = r.operatingProfit + (r.totalLabor - newLabor);
    const newRatio  = r.totalRevenue > 0 ? newLabor/r.totalRevenue*100 : 0;
    return { pct, newLabor, newProfit, newRatio };
  });
}

// ── YoY 뱃지 HTML (원본 yoyBadgeHtml 그대로) ────────────────
export function yoyBadge(cur: number, prev: number): string {
  if (!prev || prev === 0) return '<span style="color:#a0aec0;font-size:0.75rem">-</span>';
  const pct = (cur - prev) / prev * 100;
  const abs = Math.abs(pct).toFixed(1);
  const up  = pct > 0;
  return `<span style="color:${up?'#e53e3e':'#38a169'};font-size:0.75rem;font-weight:700">${up?'▲':' ▼'} ${abs}%</span>`;
}

// ── 손익 진단 신호 (원본 diagSignal 그대로) ──────────────────
export function diagSignal(pct: number, greenMax: number, yellowMax: number): 'green'|'yellow'|'red' {
  if (pct <= greenMax)  return 'green';
  if (pct <= yellowMax) return 'yellow';
  return 'red';
}
