BudgetPage.tsx에 RPC 연동해줘.

---

## RPC 함수 목록

```
get_budget_monthly(p_hotel_id, p_year)
get_budget_daily(p_hotel_id, p_year, p_month, p_otb_date)
init_budget_from_actual(p_hotel_id, p_year, p_profile_id)
upsert_budget(p_hotel_id, p_profile_id, p_rows)
```

---

## 1. 월별 데이터 조회

```ts
const { data: budgetMonthlyRows = [], isLoading: monthlyLoading } = useQuery({
  queryKey: ['budget_monthly', hotelId, selectedYear],
  queryFn: async () => {
    const { data, error } = await (supabase as any)
      .rpc('get_budget_monthly', {
        p_hotel_id: hotelId,
        p_year:     selectedYear,
      })
    if (error) throw error
    return data
  },
  enabled: !!hotelId,
  staleTime: 5 * 60 * 1000,
})

// 반환 타입
type BudgetMonthlyRow = {
  segmentation:   string
  sorting1:       string | null
  sorting2:       string | null
  sorting3:       string | null
  month_num:      number
  budget_nights:  number
  budget_revenue: number
}

// MarketTable data 형식으로 변환
const monthlyTableData = useMemo(() => {
  const result: Record<string, Record<string, any>> = {}
  budgetMonthlyRows.forEach((row: BudgetMonthlyRow) => {
    if (!result[row.segmentation]) result[row.segmentation] = {}
    result[row.segmentation][`m${row.month_num}_rn`]  = row.budget_nights
    result[row.segmentation][`m${row.month_num}_rev`] = row.budget_revenue
    result[row.segmentation][`m${row.month_num}_adr`] =
      row.budget_nights > 0
        ? Math.round(row.budget_revenue / row.budget_nights)
        : 0
  })
  // 합계 계산
  Object.keys(result).forEach(seg => {
    const totalRn  = Array.from({ length: 12 }, (_, i) => result[seg][`m${i+1}_rn`]  ?? 0).reduce((a, b) => a + b, 0)
    const totalRev = Array.from({ length: 12 }, (_, i) => result[seg][`m${i+1}_rev`] ?? 0).reduce((a, b) => a + b, 0)
    result[seg]['total_rn']  = totalRn
    result[seg]['total_rev'] = totalRev
    result[seg]['total_adr'] = totalRn > 0 ? Math.round(totalRev / totalRn) : 0
  })
  return result
}, [budgetMonthlyRows])
```

---

## 2. 일별 데이터 조회

```ts
const { data: budgetDailyRows = [], isLoading: dailyLoading } = useQuery({
  queryKey: ['budget_daily', hotelId, selectedYear, selectedMonth, otbDate],
  queryFn: async () => {
    const { data, error } = await (supabase as any)
      .rpc('get_budget_daily', {
        p_hotel_id: hotelId,
        p_year:     selectedYear,
        p_month:    selectedMonth,
        p_otb_date: otbDate,
      })
      .limit(100000)
    if (error) throw error
    return data
  },
  enabled: !!hotelId && !!otbDate && activeTab === 'daily',
  staleTime: 5 * 60 * 1000,
})

// 반환 타입
type BudgetDailyRow = {
  business_date:  string
  segmentation:   string
  sorting1:       string | null
  sorting2:       string | null
  sorting3:       string | null
  budget_nights:  number
  budget_revenue: number
  act_nights:     number
  act_revenue:    number
  otb_nights:     number
  otb_revenue:    number
}
```

---

## 3. 전년 실적 불러오기

```ts
async function handleInitFromActual() {
  if (!confirm(`${selectedYear}년 예산을 전년 실적으로 초기화할까요?\n기존 데이터가 덮어씌워집니다.`)) return

  setIsLoading(true)
  try {
    const { data, error } = await (supabase as any)
      .rpc('init_budget_from_actual', {
        p_hotel_id:   hotelId,
        p_year:       selectedYear,
        p_profile_id: profile.id,
      })
    if (error) throw error
    if (!data?.success) throw new Error(data?.error)

    alert(`${data.count}건 초기화 완료!`)
    queryClient.invalidateQueries({ queryKey: ['budget_monthly', hotelId, selectedYear] })
    queryClient.invalidateQueries({ queryKey: ['budget_daily',   hotelId, selectedYear] })
  } catch (err: any) {
    alert(err.message)
  } finally {
    setIsLoading(false)
  }
}
```

---

## 4. Budget 저장 (월별 → 일별 균등 배분)

```ts
async function saveBudgetMonthly(
  segmentation: string,
  month: number,
  rn: number,
  rev: number
) {
  const daysInMonth = new Date(selectedYear, month, 0).getDate()
  const dailyRn     = Math.round(rn  / daysInMonth)
  const dailyRev    = Math.round(rev / daysInMonth)

  const rows = Array.from({ length: daysInMonth }, (_, i) => ({
    business_date:  `${selectedYear}-${String(month).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`,
    segmentation,
    sorting1:       null,
    sorting2:       null,
    sorting3:       null,
    budget_nights:  dailyRn,
    budget_revenue: dailyRev,
  }))

  const { data, error } = await (supabase as any)
    .rpc('upsert_budget', {
      p_hotel_id:   hotelId,
      p_profile_id: profile.id,
      p_rows:       rows,
    })

  if (error) throw error
  queryClient.invalidateQueries({ queryKey: ['budget_monthly', hotelId, selectedYear] })
}
```

---

## 5. Budget 저장 (일별 직접 입력)

```ts
async function saveBudgetDaily(
  businessDate: string,
  segmentation: string,
  rn: number,
  rev: number
) {
  const { data, error } = await (supabase as any)
    .rpc('upsert_budget', {
      p_hotel_id:   hotelId,
      p_profile_id: profile.id,
      p_rows: [{
        business_date:  businessDate,
        segmentation,
        sorting1:       null,
        sorting2:       null,
        sorting3:       null,
        budget_nights:  rn,
        budget_revenue: rev,
      }],
    })

  if (error) throw error
  queryClient.invalidateQueries({ queryKey: ['budget_daily', hotelId, selectedYear, selectedMonth, otbDate] })
}
```

---

## 6. 기존 임시 조회/저장 코드 제거

```
// 제거 대상:
- a03_budget 직접 .from() 조회 코드
- 직접 .from('a03_budget').upsert() 저장 코드

// 교체:
- get_budget_monthly RPC 사용
- get_budget_daily RPC 사용
- upsert_budget RPC 사용
```

---

## 주의사항
- (supabase as any) 캐스팅 패턴 유지
- queryClient.invalidateQueries로 캐시 갱신
- 저장 실패 시 alert으로 에러 표시
- 전년 실적 불러오기 전 confirm으로 확인
- TypeScript 타입 정확히 정의
- 로딩 중 버튼 비활성화
