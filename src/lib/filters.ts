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

/** True if the section matches every chosen filter (no filters chosen: always true). */
export function matchesTypes(section: Pick<Section, 'types'>, chosen: ReadonlySet<TypeFilterId>): boolean {
  return TYPE_FILTERS.every((f) => !chosen.has(f.id) || f.types.some((t) => section.types.includes(t)))
}
