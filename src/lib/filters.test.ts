import { describe, expect, it } from 'vitest'
import { activeCount, cycleFilter, levelOf, matchesCourse, matchesTypes, matchesWhen, NO_FILTERS, type FilterState, type Level, type SearchFilters, type TypeFilterId } from './filters'
import type { DayLetter } from './time'

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

describe('panel filters', () => {
  const at = (days: string, start: string, end: string, type = 'LEC') => ({ days, start_time: start, end_time: end, type })
  const section = (...meetings: ReturnType<typeof at>[]) => ({ days: null, start_time: null, end_time: null, meetings })
  const f = (over: Partial<SearchFilters>): SearchFilters => ({ ...NO_FILTERS, ...over })

  it('levels come from the course number; 400 means 400 and up', () => {
    expect(levelOf('CHEM 190L')).toBe('100')
    expect(levelOf('AFRST 201W')).toBe('200')
    expect(levelOf('MATH 551')).toBe('400')
    expect(matchesCourse({ code: 'BIO 330', prerequisites: null }, f({ levels: new Set(['100', '300'] as Level[]) }))).toBe(true)
    expect(matchesCourse({ code: 'BIO 230', prerequisites: null }, f({ levels: new Set(['100', '300'] as Level[]) }))).toBe(false)
  })
  it('"no prereqs listed" keeps only courses without prerequisite text', () => {
    expect(matchesCourse({ code: 'CHEM 190', prerequisites: 'CHEM 120' }, f({ noPrereqs: true }))).toBe(false)
    expect(matchesCourse({ code: 'CHEM 120', prerequisites: null }, f({ noPrereqs: true }))).toBe(true)
  })
  it('days off hide any section meeting on those days', () => {
    const noFri = f({ daysOff: new Set(['F'] as DayLetter[]) })
    expect(matchesWhen(section(at('MWF', '09:00', '09:50')), noFri)).toBe(false)
    expect(matchesWhen(section(at('TR', '10:00', '11:15')), noFri)).toBe(true)
  })
  it('start-after and end-by apply to every meeting', () => {
    const tenToFour = f({ startAfter: 600, endBy: 960 })
    expect(matchesWhen(section(at('TR', '10:00', '11:15')), tenToFour)).toBe(true)
    expect(matchesWhen(section(at('MW', '09:00', '09:50')), tenToFour)).toBe(false)
    expect(matchesWhen(section(at('TR', '10:00', '11:15'), at('W', '13:00', '16:30', 'LAB')), tenToFour)).toBe(false)
  })
  it('ignores final exams and lets sections without a set time through', () => {
    const noFri = f({ daysOff: new Set(['F'] as DayLetter[]), endBy: 1020 })
    expect(matchesWhen(section(at('TR', '10:00', '11:15'), at('F', '19:00', '22:00', 'FINAL')), noFri)).toBe(true)
    expect(matchesWhen(section(), noFri)).toBe(true)
  })
  it('counts active filters', () => {
    expect(activeCount(NO_FILTERS)).toBe(0)
    expect(activeCount(f({ daysOff: new Set(['F', 'M'] as DayLetter[]), startAfter: 600, noPrereqs: true, types: new Map([['pe', 'exclude']]) }))).toBe(5)
  })
})
