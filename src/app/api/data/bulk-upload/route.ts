import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { type, hotel_id, update_date, do_delete, is_last, business_dates, rows } = await req.json()

    if (!hotel_id || !rows?.length) {
      return NextResponse.json({ error: '필수 값 누락' }, { status: 400 })
    }

    console.log('첫 번째 row business_date:', rows[0]?.business_date)
    console.log('타입:', typeof rows[0]?.business_date)
    console.log('값:', JSON.stringify(rows[0]?.business_date))

    // 브라우저(transformRow)에서 이미 변환된 값을 그대로 사용
    // OTB: 각 row의 update_date 우선, 없으면 상위 update_date 사용
    const insertData = type === 'otb'
      ? rows.map((row: any) => ({ ...row, update_date: row.update_date ?? update_date ?? null }))
      : rows

    const CHUNK = 500
    let   count = 0

    if (type === 'actual') {
      // ── Actual ──────────────────────────────────────────────────────────────

      // 1. DELETE (한 번만 — 첫 번째 API 요청에만 business_dates 전달됨)
      if (business_dates?.length > 0) {
        const { error } = await adminClient.rpc('r01_delete_actual', {
          p_hotel_id: hotel_id,
          p_dates:    business_dates,
        })
        if (error) throw new Error(`DELETE 오류: ${error.message}`)
      }

      // 3. INSERT (청크 반복)
      for (let i = 0; i < insertData.length; i += CHUNK) {
        const chunk = insertData.slice(i, i + CHUNK)

        const { data, error } = await adminClient.rpc('r01_insert_actual', {
          p_hotel_id: hotel_id,
          p_rows:     chunk,
        })
        if (error || !data?.success) {
          throw new Error(error?.message ?? data?.error ?? 'RPC 오류')
        }
        count += data.count
      }

      // 4. 마지막 청크에서 집계 테이블 갱신
      if (is_last && business_dates?.length > 0) {
        try {
          const { error: refreshError } = await adminClient.rpc('a02_refresh_actual_daily', {
            p_hotel_id: hotel_id,
            p_dates:    business_dates,
          })
          if (refreshError) console.error('Actual 집계 갱신 오류:', refreshError)
        } catch (e) {
          console.error('Actual 집계 갱신 예외:', e)
        }
      }

    } else {
      // ── OTB ─────────────────────────────────────────────────────────────────

      // 1. DELETE (do_delete === true인 첫 번째 청크에만 실행)
      if (do_delete && update_date) {
        const { error } = await adminClient.rpc('r02_delete_otb', {
          p_hotel_id:    hotel_id,
          p_update_date: update_date,
        })
        if (error) throw new Error(`DELETE 오류: ${error.message}`)
      }

      // 2. INSERT (청크 반복)
      for (let i = 0; i < insertData.length; i += CHUNK) {
        const chunk = insertData.slice(i, i + CHUNK)

        const { data, error } = await adminClient.rpc('r02_insert_otb', {
          p_hotel_id:    hotel_id,
          p_update_date: null,   // 각 row의 update_date 사용 (COALESCE fallback)
          p_rows:        chunk,
        })
        if (error || !data?.success) {
          throw new Error(error?.message ?? data?.error ?? 'RPC 오류')
        }
        count += data.count
      }

      // 3. 마지막 청크에서 집계 테이블 갱신
      if (is_last && update_date) {
        try {
          const { error: refreshError } = await adminClient
            .rpc('a01_refresh_otb_daily', { p_hotel_id: hotel_id, p_update_date: update_date })
          if (refreshError) console.error('집계 갱신 오류:', refreshError)
        } catch (e) {
          console.error('집계 갱신 예외:', e)
        }
      }
    }

    return NextResponse.json({ success: true, count })

  } catch (err: any) {
    console.error('bulk upload error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
