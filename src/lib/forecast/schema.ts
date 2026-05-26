import { supabase } from '@/lib/supabase'
import type { C05Row, SchemaNode, ColumnGroup, SubColumn } from './types'

// ─── Fetch ──────────────────────────────────────────────────────────────────────

export async function fetchForecastSchema(hotelId: string): Promise<C05Row[]> {
  const { data, error } = await (supabase as any)
    .from('c05_market_table_schema')
    .select('id, name, level, parent_id, segmentation, order_index, is_bold, is_active')
    .eq('hotel_id', hotelId)
    .eq('is_active', true)
    .order('order_index', { ascending: true })

  if (error) throw error
  return (data ?? []) as C05Row[]
}

// ─── Tree builder ───────────────────────────────────────────────────────────────

export function buildSchemaTree(rows: C05Row[]): SchemaNode[] {
  const nodeMap = new Map<string, SchemaNode>()

  for (const row of rows) {
    nodeMap.set(row.id, {
      id:                 row.id,
      name:               row.name,
      level:              row.level,
      isBold:             row.is_bold,
      orderIndex:         row.order_index,
      segmentationCodes:  [...row.segmentation],
      children:           [],
    })
  }

  const roots: SchemaNode[] = []

  for (const row of rows) {
    const node = nodeMap.get(row.id)
    if (!node) continue

    if (row.parent_id === null) {
      roots.push(node)
    } else {
      const parent = nodeMap.get(row.parent_id)
      if (parent) parent.children.push(node)
    }
  }

  // Sort by orderIndex
  roots.sort((a, b) => a.orderIndex - b.orderIndex)
  for (const root of roots) {
    root.children.sort((a, b) => a.orderIndex - b.orderIndex)
  }

  // Aggregate segmentationCodes for parent nodes from children
  for (const root of roots) {
    if (root.children.length > 0) {
      root.segmentationCodes = root.children.flatMap(c => c.segmentationCodes)
    }
  }

  return roots
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

export function getAllSegCodes(nodes: SchemaNode[]): string[] {
  return nodes.flatMap(node =>
    node.children.length > 0
      ? node.children.flatMap(c => c.segmentationCodes)
      : node.segmentationCodes,
  )
}

export function buildColumnGroups(
  nodes: SchemaNode[],
  allCodes: string[],
): ColumnGroup[] {
  const groups: ColumnGroup[] = nodes.map(node => {
    if (node.children.length > 0) {
      const subCols: SubColumn[] = [
        { id: `${node.id}-sum`, label: '(합산)', segCodes: node.segmentationCodes, isSummary: true },
        ...node.children.map(child => ({
          id:        child.id,
          label:     child.name,
          segCodes:  child.segmentationCodes,
          isSummary: false,
        })),
      ]
      return {
        id:            node.id,
        parentLabel:   node.name,
        parentIsBold:  node.isBold,
        parentRowSpan: 1 as const,
        parentColSpan: subCols.length * 3,
        subCols,
      }
    } else {
      return {
        id:            node.id,
        parentLabel:   node.name,
        parentIsBold:  node.isBold,
        parentRowSpan: 2 as const,
        parentColSpan: 3,
        subCols: [{ id: node.id, label: '', segCodes: node.segmentationCodes, isSummary: false }],
      }
    }
  })

  // Total column (always last)
  groups.push({
    id:            'total',
    parentLabel:   'Total',
    parentIsBold:  false,
    parentRowSpan: 2,
    parentColSpan: 3,
    subCols: [{ id: 'total', label: '', segCodes: allCodes, isSummary: true }],
  })

  return groups
}
