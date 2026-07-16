import { fetchAllInputs, upsertPlResult } from './queries';
import { buildPlInput, calcPl } from './calc';

export async function saveAndRecalc(hotelId: string, year: number) {
  const { rev, lab, fix, vari, nonOp } = await fetchAllInputs(hotelId, year);
  const inp    = buildPlInput(rev, lab, fix, vari, nonOp);
  const result = calcPl(inp);
  await upsertPlResult({
    hotel_id: hotelId, analysis_year: year,
    total_revenue: result.totalRevenue,
    sold_rooms: result.sold,
    occ_pct: result.occ,
    adr: result.adr,
    revpar: result.revpar,
    total_labor: result.totalLabor,
    ins_total: result.insTotal,
    total_tax_fees: result.totalTaxFees,
    total_admin: result.totalAdmin,
    total_material: result.totalVariable,
    total_marketing: 0,
    total_operating: 0,
    total_asset: 0,
    total_non_op: result.totalNonOp,
    total_cost: result.totalCost,
    gross_profit: result.totalRevenue - result.totalVariable,
    operating_profit: result.operatingProfit,
    net_income: result.netIncome,
    labor_ratio: result.laborRatio,
    op_margin: result.opMargin,
    net_margin: result.netMargin,
    salary: result.salary, allowance: result.allowance,
    retirement: result.retirement, welfare: result.welfare, outsourcing: result.outsourcing,
  });
  return result;
}
