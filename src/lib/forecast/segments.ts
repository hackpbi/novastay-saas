export type Segment = {
  id: string
  name: string
  isBold: boolean
  orderIndex: number
}

export const SEGMENTS: Segment[] = [
  { id: 'corpfit',  name: 'Corp. FIT', isBold: false, orderIndex: 0 },
  { id: 'direct',   name: 'Direct',    isBold: false, orderIndex: 1 },
  { id: 'ta',       name: 'TA',        isBold: false, orderIndex: 2 },
  { id: 'employee', name: 'Employee',  isBold: true,  orderIndex: 3 },
  { id: 'member',   name: 'Member',    isBold: true,  orderIndex: 4 },
  { id: 'group',    name: 'Group',     isBold: false, orderIndex: 5 },
  { id: 'comp',     name: 'Comp',      isBold: true,  orderIndex: 6 },
  { id: 'houseuse', name: 'House Use', isBold: true,  orderIndex: 7 },
]
