import type { Goal } from './goal'
import type { GoalColumnType } from '@/store/goalsStore'

export interface TodoItem {
  id: string
  text: string
  completed: boolean
  notes?: string
  color?: string
  icon?: string
  targetValue?: number
  targetPeriod?: Goal['targetPeriod']
  status?: Goal['status']
}

export type ColumnType = 'week' | 'month' | 'year' | 'life'

export type TodoStore = Record<string, TodoItem[]>

export interface DragState {
  itemId: string
  sourceColumnType: ColumnType
  hoverColumnType: ColumnType | null
  dropTarget: { columnType: ColumnType; itemId: string; position: 'before' | 'after' } | null
}

export interface GoalWriteRow {
  id: string
  user_id: string
  name: string
  notes: string | null
  color: string
  icon: string
  target_value: number
  target_period: Goal['targetPeriod']
  status: Goal['status']
  completed: boolean
  column_type: GoalColumnType
  bucket_key: string
  sort_order: number
}

export interface SearchGoalResult {
  id: string
  text: string
  notes: string
  color?: string
  icon?: string
  targetValue?: number
  targetPeriod?: Goal['targetPeriod']
  status?: Goal['status']
  completed: boolean
  columnType: ColumnType
  bucketKey: string
  bucketLabel: string
}
