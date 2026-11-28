import type { Section } from './types'

/**
 * Course-type filters shown as chips under the search box. Each matches a section whose
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
