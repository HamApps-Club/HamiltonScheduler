import { meetingsOf, parseDays, toMinutes, type DayLetter } from './time'
import type { Course, Section } from './types'

/**
 * Course-type filters shown as chips in the Filters panel. Each matches a section whose
 * `types` (Self-Service course types) include any of its labels. To add one, append an entry:
 * see "Adding a search filter" in the README for the labels.
 */
export const TYPE_FILTERS = [
  { id: 'writing', label: 'Writing Intensive', types: ['Writing Intensive Courses'] },
  { id: 'speaking', label: 'Speaking Intensive', types: ['Speaking Intensive Course'] },
  { id: 'quant', label: 'Quantitative', types: ['Quantitative & Symbolic R'] },
  { id: 'social', label: 'Social Structures', types: ['Soc, Struct & Inst Hier'] },
  { id: 'diversity', label: 'Diversity', types: ['Cultural Diversity Course', 'Diversity Course'] },
  { id: 'proseminar', label: 'Proseminar', types: ['Proseminar'] },
  { id: 'firstyear', label: 'First Year', types: ['First Year Courses'] },
  { id: 'pe', label: 'Phys Ed', types: ['Physical Education Course'] },
  { id: 'senior', label: 'Senior Project', types: ['Senior Project'] },
] as const

export type TypeFilterId = (typeof TYPE_FILTERS)[number]['id']

/** A chip is off (not in the map), "include" (only these) or "exclude" (hide these). */
export type FilterState = 'include' | 'exclude'
export type TypeFilters = ReadonlyMap<TypeFilterId, FilterState>

/** Clicking a chip cycles: off -> include -> exclude -> off. */
export function cycleFilter(filters: TypeFilters, id: TypeFilterId): TypeFilters {
  const next = new Map(filters)
  const now = filters.get(id)
  if (!now) next.set(id, 'include')
  else if (now === 'include') next.set(id, 'exclude')
  else next.delete(id)
  return next
}

/** True if the section has every included type and none of the excluded ones (no filters: always true). */
export function matchesTypes(section: Pick<Section, 'types'>, filters: TypeFilters): boolean {
  return TYPE_FILTERS.every((f) => {
    const state = filters.get(f.id)
    if (!state) return true
    const has = f.types.some((t) => section.types.includes(t))
    return state === 'include' ? has : !has
  })
}

// ---------- Everything in the Filters panel ----------

export const LEVELS = ['100', '200', '300', '400'] as const // '400' means 400 and up
export type Level = (typeof LEVELS)[number]

export interface SearchFilters {
  types: TypeFilters
  daysOff: ReadonlySet<DayLetter> // no meeting on these days
  startAfter: number | null // minutes after midnight: every meeting starts at or after this
  endBy: number | null // every meeting ends at or before this
  levels: ReadonlySet<Level> // course number level (any of these)
  noPrereqs: boolean // only courses with no prerequisites listed
}

export const NO_FILTERS: SearchFilters = {
  types: new Map(), daysOff: new Set(), startAfter: null, endBy: null, levels: new Set(), noPrereqs: false,
}

/** How many filters are on (for the button's badge). */
export function activeCount(f: SearchFilters): number {
  return f.types.size + f.daysOff.size + (f.startAfter != null ? 1 : 0) + (f.endBy != null ? 1 : 0) + f.levels.size + (f.noPrereqs ? 1 : 0)
}

/** "CHEM 190L" -> "100"; 400-, 500-level… -> "400". */
export function levelOf(code: string): Level | null {
  const d = code.match(/\b(\d)\d\d/)?.[1]
  if (!d) return null
  return d >= '4' ? '400' : (`${d}00` as Level)
}

/** Course-wide filters: level and prerequisites. */
export function matchesCourse(c: Pick<Course, 'code' | 'prerequisites'>, f: SearchFilters): boolean {
  if (f.levels.size && !f.levels.has(levelOf(c.code) as Level)) return false
  if (f.noPrereqs && c.prerequisites) return false
  return true
}

/**
 * Day and time filters for one section. Final exams don't count, and a section with no set
 * time (independent study, TBA) always passes.
 */
export function matchesWhen(s: Parameters<typeof meetingsOf>[0], f: SearchFilters): boolean {
  if (!f.daysOff.size && f.startAfter == null && f.endBy == null) return true
  return meetingsOf(s).filter((m) => m.type !== 'FINAL').every((m) =>
    !parseDays(m.days).some((d) => f.daysOff.has(d))
    && (f.startAfter == null || toMinutes(m.start_time) >= f.startAfter)
    && (f.endBy == null || toMinutes(m.end_time) <= f.endBy))
}
