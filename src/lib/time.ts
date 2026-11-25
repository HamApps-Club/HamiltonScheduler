import type { Meeting, Section } from './types'

/** Day letters used in the catalog, in calendar order. R = Thursday, S = Saturday, U = Sunday. */
export const DAY_ORDER = ['M', 'T', 'W', 'R', 'F', 'S', 'U'] as const
export type DayLetter = (typeof DAY_ORDER)[number]

export const DAY_NAMES: Record<DayLetter, string> = {
  M: 'Mon', T: 'Tue', W: 'Wed', R: 'Thu', F: 'Fri', S: 'Sat', U: 'Sun',
}

/** JavaScript getDay() index (0 = Sunday) for each day letter. */
export const DAY_TO_JS: Record<DayLetter, number> = { U: 0, M: 1, T: 2, W: 3, R: 4, F: 5, S: 6 }

export function parseDays(days: string | null | undefined): DayLetter[] {
  if (!days) return []
  const set = new Set(days.toUpperCase().split(''))
  return DAY_ORDER.filter((d) => set.has(d))
}

/** "13:05:00" or "13:05" -> minutes after midnight. */
export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** "13:05:00" -> "1:05 PM" */
export function formatTime(time: string): string {
  const mins = toMinutes(time)
  const h24 = Math.floor(mins / 60)
  const m = mins % 60
  const h12 = ((h24 + 11) % 12) + 1
  return `${h12}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`
}

/** What the scheduling logic needs from a section. */
export type Timed = Pick<Section, 'days' | 'start_time' | 'end_time'> &
  Partial<Pick<Section, 'meetings' | 'building' | 'room'>>

/** All real (timed) meetings of a section; falls back to the section's primary time. */
export function meetingsOf(s: Timed): Meeting[] {
  const list = (s.meetings ?? []).filter((m) => parseDays(m.days).length > 0 && m.start_time && m.end_time)
  if (list.length) return list
  if (parseDays(s.days).length && s.start_time && s.end_time) {
    return [{ days: s.days!, start_time: s.start_time, end_time: s.end_time, building: s.building ?? null, room: s.room ?? null }]
  }
  return []
}

/** True when the section has at least one meeting with real days and times (not TBA). */
export function hasMeetingTime(s: Timed): boolean {
  return meetingsOf(s).length > 0
}

const fmtMeeting = (m: Meeting) => `${parseDays(m.days).join('')} ${formatTime(m.start_time)}–${formatTime(m.end_time)}`

/** "MWF 9:00 AM–9:50 AM" (several meetings joined with "; "), or "TBA". */
export function formatMeeting(s: Timed): string {
  const list = meetingsOf(s)
  return list.length ? list.map(fmtMeeting).join('; ') : 'TBA'
}

/** Do two meetings overlap: a shared day, overlapping times, and overlapping date ranges? */
export function meetingsOverlap(a: Meeting, b: Meeting): boolean {
  const bDays = new Set(parseDays(b.days))
  if (!parseDays(a.days).some((d) => bDays.has(d))) return false
  if (!(toMinutes(a.start_time) < toMinutes(b.end_time) && toMinutes(b.start_time) < toMinutes(a.end_time))) return false
  // Half-semester courses in different halves never clash.
  if (a.start_date && a.end_date && b.start_date && b.end_date) {
    return a.start_date <= b.end_date && b.start_date <= a.end_date
  }
  return true
}

/** Two sections conflict when any of their meetings overlap (touching ends don't count). */
export function sectionsConflict(a: Timed, b: Timed): boolean {
  const bm = meetingsOf(b)
  return meetingsOf(a).some((x) => bm.some((y) => meetingsOverlap(x, y)))
}

/** Does `candidate` conflict with any of `scheduled` (ignoring itself)? */
export function conflictsWithAny<T extends Timed & { id: number }>(candidate: T, scheduled: T[]): boolean {
  return scheduled.some((s) => s.id !== candidate.id && sectionsConflict(candidate, s))
}

export interface CalendarBlock<T> {
  item: T
  meeting: Meeting
  day: DayLetter
  start: number // minutes
  end: number
  lane: number // 0-based column within an overlapping group
  lanes: number // total columns in that group
  conflict: boolean
}

/**
 * Lay out sections on a weekly grid: one block per meeting per day. Blocks that overlap
 * in time sit side by side; they're flagged as conflicts only if their dates also overlap.
 */
export function layoutCalendar<T extends Timed>(items: T[]): CalendarBlock<T>[] {
  const out: CalendarBlock<T>[] = []
  for (const day of DAY_ORDER) {
    const blocks: CalendarBlock<T>[] = []
    for (const item of items) {
      for (const meeting of meetingsOf(item)) {
        if (!parseDays(meeting.days).includes(day)) continue
        blocks.push({ item, meeting, day, start: toMinutes(meeting.start_time), end: toMinutes(meeting.end_time), lane: 0, lanes: 1, conflict: false })
      }
    }
    blocks.sort((a, b) => a.start - b.start || a.end - b.end)

    let group: CalendarBlock<T>[] = []
    let groupEnd = -1
    const flush = () => {
      const laneEnds: number[] = []
      for (const b of group) {
        let lane = laneEnds.findIndex((end) => end <= b.start)
        if (lane === -1) { lane = laneEnds.length; laneEnds.push(b.end) } else laneEnds[lane] = b.end
        b.lane = lane
      }
      for (const b of group) {
        b.lanes = laneEnds.length
        b.conflict = group.some((o) => o !== b && o.item !== b.item && meetingsOverlap(o.meeting, b.meeting))
      }
      out.push(...group)
      group = []
    }
    for (const b of blocks) {
      if (group.length && b.start >= groupEnd) flush()
      group.push(b)
      groupEnd = Math.max(groupEnd, b.end)
    }
    if (group.length) flush()
  }
  return out
}
