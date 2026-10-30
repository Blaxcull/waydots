import type { EventPositions } from '@/lib/eventUtils'

export const EVENT_TOP_GAP = 2
export const EVENT_SIDE_GAP = 2
export const EVENT_FULL_WIDTH_WITH_GAPS = `calc(100% - ${EVENT_SIDE_GAP * 2}px)`

const normalizeCssLength = (value: string) => {
  if (value === '0') return '0%'
  if (value === '100') return '100%'
  return value
}

export const insetEventLeft = (left: string) =>
  `calc(${normalizeCssLength(left)} + ${EVENT_SIDE_GAP}px)`

export const insetEventWidth = (width: string) =>
  `calc(${normalizeCssLength(width)} - ${EVENT_SIDE_GAP * 2}px)`

export const applyInsetPositionsToDOM = (positions: EventPositions) => {
  requestAnimationFrame(() => {
    for (const id in positions) {
      const el = document.getElementById(id)
      if (!el) continue

      const { left, width, zIndex } = positions[id]
      el.style.transition = 'left 200ms ease, width 200ms ease'
      el.style.left = insetEventLeft(left)
      el.style.width = insetEventWidth(width)
      el.style.zIndex = String(zIndex)
    }
  })
}
