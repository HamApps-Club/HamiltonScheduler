import { describe, expect, it } from 'vitest'
import { cycleFilter, matchesTypes, type FilterState, type TypeFilterId } from './filters'

const sec = (...types: string[]) => ({ types })
const pick = (...ids: TypeFilterId[]) => new Map(ids.map((id) => [id, 'include' as FilterState]))
const without = (...ids: TypeFilterId[]) => new Map(ids.map((id) => [id, 'exclude' as FilterState]))

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
  it('hides excluded types', () => {
    expect(matchesTypes(sec('Writing Intensive Courses'), without('writing'))).toBe(false)
    expect(matchesTypes(sec('Proseminar'), without('writing'))).toBe(true)
    expect(matchesTypes(sec(), without('writing'))).toBe(true)
  })
  it('combines include and exclude', () => {
    const f = new Map<TypeFilterId, FilterState>([['quant', 'include'], ['firstyear', 'exclude']])
    expect(matchesTypes(sec('Quantitative & Symbolic R'), f)).toBe(true)
    expect(matchesTypes(sec('Quantitative & Symbolic R', 'First Year Courses'), f)).toBe(false)
    expect(matchesTypes(sec('First Year Courses'), f)).toBe(false)
  })
})

describe('cycleFilter', () => {
  it('goes off -> include -> exclude -> off', () => {
    let f = cycleFilter(new Map(), 'writing')
    expect(f.get('writing')).toBe('include')
    f = cycleFilter(f, 'writing')
    expect(f.get('writing')).toBe('exclude')
    f = cycleFilter(f, 'writing')
    expect(f.has('writing')).toBe(false)
  })
  it('leaves other chips alone', () => {
    const f = cycleFilter(new Map([['quant', 'include']]), 'writing')
    expect(f.get('quant')).toBe('include')
  })
})
