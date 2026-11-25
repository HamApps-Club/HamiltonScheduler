import { describe, expect, it } from 'vitest'
import { buildIcs, firstMeetingDate } from './ics'
import type { Course, SectionWithCourse, Term } from './types'

const term: Term = {
  id: '2027SP', name: 'Spring 2027', is_active: true,
  start_date: '2027-01-20', // a Wednesday
  end_date: '2027-05-07',
  no_class_dates: ['2027-03-15', '2027-03-16', '2027-03-17', '2027-03-18', '2027-03-19', '2026-12-25'],
}
const course: Course = {
  id: 1, term_id: '2027SP', code: 'CPSCI 101', title: 'Intro, to CS; part 1', department: 'Computer Science',
  credits: 1, description: null, cross_listed: [], catalog_url: null, sections: [],
}
const section = (over: Partial<SectionWithCourse>): SectionWithCourse => ({
  id: 7, course_id: 1, section: '02', instructors: ['A. Prof'], days: 'TR', start_time: '13:00:00', end_time: '14:15:00',
  building: 'Taylor Science', room: '2004', capacity: 30,
  status: 'open', meetings: [], comments: null, course, ...over,
})
const unfold = (ics: string) => ics.replace(/\r\n /g, '')

describe('firstMeetingDate', () => {
  it('finds the first class day on or after the term start', () => {
    expect(firstMeetingDate('2027-01-20', ['T', 'R'])!.toISOString().slice(0, 10)).toBe('2027-01-21')
    expect(firstMeetingDate('2027-01-20', ['M', 'W', 'F'])!.toISOString().slice(0, 10)).toBe('2027-01-20')
  })
})

describe('buildIcs', () => {
  const ics = unfold(buildIcs(term, [section({})], new Date('2026-11-25T00:00:00Z')))

  it('uses CRLF line endings and wraps a calendar', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
  })
  it('starts on the first matching day and repeats weekly until term end', () => {
    expect(ics).toContain('DTSTART;TZID=America/New_York:20270121T130000')
    expect(ics).toContain('DTEND;TZID=America/New_York:20270121T141500')
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20270508T035959Z')
  })
  it('skips only no-class dates that fall on meeting days within the term', () => {
    expect(ics).toContain('EXDATE;TZID=America/New_York:20270316T130000,20270318T130000')
    expect(ics).not.toContain('20270315T130000')
    expect(ics).not.toContain('20261225')
  })
  it('escapes text and includes code-section, location and instructor', () => {
    expect(ics).toContain('SUMMARY:CPSCI 101-02 Intro\\, to CS\\; part 1')
    expect(ics).toContain('LOCATION:Taylor Science 2004')
    expect(ics).toContain('Instructor: A. Prof')
  })
  it('leaves out TBA and canceled sections', () => {
    const out = buildIcs(term, [section({ id: 8, days: null, start_time: null, end_time: null }), section({ id: 9, status: 'canceled' })])
    expect(out).not.toContain('BEGIN:VEVENT')
  })
  it('makes one event per meeting and uses each meeting\'s own dates', () => {
    const out = unfold(buildIcs(term, [section({ meetings: [
      { days: 'TR', start_time: '13:00', end_time: '14:15', type: 'LEC', start_date: '2027-01-20', end_date: '2027-03-05' },
      { days: 'W', start_time: '14:00', end_time: '16:00', type: 'LAB', building: 'Taylor Science', room: '1009', start_date: '2027-01-20', end_date: '2027-03-05' },
    ] })]))
    expect(out.match(/BEGIN:VEVENT/g)).toHaveLength(2)
    expect(out).toContain('SUMMARY:CPSCI 101-02 (LAB)')
    expect(out).toContain('DTSTART;TZID=America/New_York:20270120T140000') // first Wednesday
    expect(out).toContain('UNTIL=20270306T035959Z') // half-semester end
    expect(out).not.toContain('EXDATE') // spring break is after the course ends
    expect(out).toContain('LOCATION:Taylor Science 1009')
  })
  it('folds long lines to 75 octets', () => {
    const long = buildIcs(term, [section({ course: { ...course, title: 'X'.repeat(200) } })])
    for (const line of long.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
  })
})
