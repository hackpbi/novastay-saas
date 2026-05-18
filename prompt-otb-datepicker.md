AppLayout.tsx와 DatePicker.tsx를 수정해줘.
OTB Date Picker에 r02_otb의 update_date 목록을 연동하고
가장 최근 날짜가 자동 선택되도록 변경.
VS OTB Date Picker도 연동하고 OTB 날짜 기준으로 자동 선택되도록 변경.

---

## 변경 사항

### AppLayout.tsx

1. r02_otb에서 update_date 목록 조회 추가
```ts
const { data: otbDates = [] } = useQuery({
  queryKey: ['r02_otb_dates', hotelId],
  queryFn: async () => {
    const { data, error } = await (supabase as any)
      .from('r02_otb')
      .select('update_date')
      .eq('hotel_id', hotelId)
      .order('update_date', { ascending: false })
    if (error) throw error
    return [...new Set(data?.map((d: any) => d.update_date) ?? [])] as string[]
  },
  enabled: !!hotelId,
  staleTime: 5 * 60 * 1000,
})
```

2. OTB 날짜 초기값을 오늘 → 가장 최근 update_date로 변경
```ts
const [otbDate,   setOtbDate]   = useState<string>('')
const [vsOtbDate, setVsOtbDate] = useState<string>('')

// otbDates 로드 후 자동 설정
useEffect(() => {
  if (otbDates.length === 0) return

  // OTB: 가장 최근 날짜 (index 0)
  if (!otbDate) {
    setOtbDate(otbDates[0])
  }
}, [otbDates])
```

3. VS OTB 자동 선택 로직
```ts
// OTB 날짜 변경 시 VS OTB 자동 재설정
useEffect(() => {
  if (!otbDate || otbDates.length === 0) return

  // OTB보다 이전 날짜 중 가장 가까운 날짜 선택
  const prevDates = otbDates.filter(d => d < otbDate)

  if (prevDates.length === 0) {
    // OTB보다 이전 날짜 없으면 VS OTB 비움
    setVsOtbDate('')
    return
  }

  // 가장 가까운 이전 날짜 (내림차순 첫 번째)
  const closest = prevDates[0]

  // VS OTB가 비어있거나 OTB보다 같거나 이후 날짜면 자동 재설정
  if (!vsOtbDate || vsOtbDate >= otbDate) {
    setVsOtbDate(closest)
  }
}, [otbDate, otbDates])
```

4. DatePicker에 props 전달
```tsx
{/* OTB Date Picker */}
<DatePicker
  label="OTB"
  value={otbDate}
  onChange={setOtbDate}
  availableDates={otbDates}
/>

{/* VS OTB Date Picker */}
<DatePicker
  label="VS OTB"
  value={vsOtbDate}
  onChange={setVsOtbDate}
  availableDates={otbDates.filter(d => d < otbDate)}  // OTB보다 이전 날짜만
/>
```

---

### DatePicker.tsx

availableDates props 추가 — 해당 날짜만 선택 가능하도록

```ts
type DatePickerProps = {
  label:           string
  value:           string
  onChange:        (date: string) => void
  availableDates?: string[]  // ← 추가 (없으면 모든 날짜 선택 가능)
}
```

날짜 선택 UI에서 availableDates 적용:
```tsx
// availableDates가 있으면 해당 날짜만 표시
// 없으면 기존처럼 모든 날짜 선택 가능

// 달력에서 날짜 비활성화
const isDisabled = (date: string) => {
  if (!availableDates || availableDates.length === 0) return false
  return !availableDates.includes(date)
}

// 비활성화된 날짜 스타일
style={{
  opacity: isDisabled(date) ? 0.3 : 1,
  cursor:  isDisabled(date) ? 'not-allowed' : 'pointer',
  pointerEvents: isDisabled(date) ? 'none' : 'auto',
}}

// 드롭다운 방식이라면 availableDates만 옵션으로 표시
{availableDates?.map(date => (
  <option key={date} value={date}>{date}</option>
))}
```

---

## VS OTB 동작 규칙 요약
```
규칙 1. 초기 로드 시
        OTB = 가장 최근 날짜
        VS OTB = OTB보다 이전 날짜 중 가장 가까운 날짜

규칙 2. OTB 날짜 변경 시
        VS OTB가 OTB와 같거나 이후 날짜이면
        → OTB보다 이전 날짜 중 가장 가까운 날짜로 자동 재설정

규칙 3. VS OTB 선택 가능 날짜
        → OTB보다 이전 날짜만 표시/선택 가능

규칙 4. OTB보다 이전 날짜가 없으면
        → VS OTB 빈 값 처리
```

---

## 주의사항
- OTB / VS OTB Date Picker만 availableDates 적용
- FCST / HK는 기존 방식 유지
- otbDates 로딩 중에는 기존 날짜 유지
- hotelId 변경 시 otbDates 재조회 + 날짜 재설정
- (supabase as any) 캐스팅 패턴 유지
- 기존 DatePicker 동작 변경 없음 (availableDates 없으면 기존과 동일)
