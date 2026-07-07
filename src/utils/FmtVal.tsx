import React from 'react'

/**
 * K/M(대소문자) 단위를 숫자 대비 70% 크기로 분리 렌더
 * 예: "136K" → "136" + "K"(작게), "145.4M" → "145.4" + "M", "+6k" → "+6" + "k"
 */
export function FmtVal({ val, numSize = 16 }: { val: string; numSize?: number }) {
  const unitSize = Math.round(numSize * 0.7)
  const match = String(val).match(/^([+\-]?[\d,.]+)([KMkm])$/)
  if (!match) return <span style={{ fontSize: numSize }}>{val}</span>
  return (
    <span style={{ fontSize: numSize }}>
      {match[1]}<span style={{ fontSize: unitSize }}>{match[2]}</span>
    </span>
  )
}
