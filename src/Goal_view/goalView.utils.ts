import { endOfWeek, format, startOfWeek } from 'date-fns'
import type { GoalColumnType } from '@/store/goalsStore'
import type { ColumnType } from './goalView.types'

export const generateId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2, 11)

export const getKey = (type: ColumnType, date: Date): string => {
  if (type === 'life') return 'life'
  if (type === 'year') return `year-${date.getFullYear()}`
  if (type === 'month') return `month-${date.getFullYear()}-${date.getMonth()}`
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day
  d.setDate(diff)
  return `week-${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export const getColumnTypeFromBucketKey = (bucketKey: string): GoalColumnType | null => {
  if (bucketKey === 'life') return 'life'
  if (bucketKey.startsWith('week-')) return 'week'
  if (bucketKey.startsWith('month-')) return 'month'
  if (bucketKey.startsWith('year-')) return 'year'
  return null
}

export const parseBucketDate = (bucketKey: string): Date | null => {
  if (bucketKey === 'life') return null

  const parts = bucketKey.split('-')
  if (parts[0] === 'week' && parts.length === 4) {
    return new Date(Number(parts[1]), Number(parts[2]), Number(parts[3]))
  }
  if (parts[0] === 'month' && parts.length === 3) {
    return new Date(Number(parts[1]), Number(parts[2]), 1)
  }
  if (parts[0] === 'year' && parts.length === 2) {
    return new Date(Number(parts[1]), 0, 1)
  }

  return null
}

export const getBucketLabel = (columnType: ColumnType, bucketKey: string): string => {
  const bucketDate = parseBucketDate(bucketKey)

  if (columnType === 'life') return 'All time'
  if (!bucketDate) return columnType

  if (columnType === 'week') {
    const weekStart = startOfWeek(bucketDate, { weekStartsOn: 0 })
    const weekEnd = endOfWeek(bucketDate, { weekStartsOn: 0 })
    return `${format(weekStart, 'd MMM')} - ${format(weekEnd, 'd MMM')}`
  }
  if (columnType === 'month') {
    return format(bucketDate, 'MMMM yyyy')
  }
  return format(bucketDate, 'yyyy')
}

export const slideVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 80 : -80,
    opacity: 0,
    scale: 0.98,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -80 : 80,
    opacity: 0,
    scale: 0.98,
  }),
}
