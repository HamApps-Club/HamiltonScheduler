import { describe, expect, it } from 'vitest'
import { matchesTypes, type TypeFilterId } from './filters'

const sec = (...types: string[]) => ({ types })
const pick = (...ids: TypeFilterId[]) => new Set(ids)

describe('matchesTypes', () => {
  it('lets everything through when no filter is chosen', () => {
    expect(matchesTypes(sec(), pick())).toBe(true)
  })
  it('matches by Self-Service label', () => {
    expect(matchesTypes(sec('Writing Intensive Courses'), pick('writing'))).toBe(true)
    expect(matchesTypes(sec('Speaking Intensive Course'), pick('writing'))).toBe(false)
    expect(matchesTypes(sec(), pick('writing'))).toBe(false)
  })
  it('accepts any of a filter\'s labels', () => {
    expect(matchesTypes(sec('Diversity Course'), pick('diversity'))).toBe(true)
    expect(matchesTypes(sec('Cultural Diversity Course'), pick('diversity'))).toBe(true)
  })
  it('requires every chosen filter', () => {
    expect(matchesTypes(sec('Writing Intensive Courses', 'Proseminar'), pick('writing', 'proseminar'))).toBe(true)
    expect(matchesTypes(sec('Writing Intensive Courses'), pick('writing', 'proseminar'))).toBe(false)
  })
})
