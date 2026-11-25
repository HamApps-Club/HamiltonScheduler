import { describe, expect, it } from 'vitest'
import { conflictsWithAny, formatMeeting, formatTime, layoutCalendar, parseDays, sectionsConflict } from './time'

const s = (id: number, days: string | null, start: string | null, end: string | null) =>
  ({ id, days, start_time: start, end_time: end })

describe('parseDays', () => {
  it('orders days and handles R for Thursday', () => {
    expect(parseDays('RTM')).toEqual(['M', 'T', 'R'])
  })
  it('treats blank as TBA', () => {
    expect(parseDays(null)).toEqual([])
    expect(parseDays('')).toEqual([])
  })
})

describe('formatting', () => {
  it('formats 12-hour times', () => {
    expect(formatTime('09:00:00')).toBe('9:00 AM')
    expect(formatTime('12:15:00')).toBe('12:15 PM')
    expect(formatTime('00:30')).toBe('12:30 AM')
    expect(formatTime('13:05:00')).toBe('1:05 PM')
  })
  it('formats meetings and TBA', () => {
    expect(formatMeeting(s(1, 'MWF', '09:00:00', '09:50:00'))).toBe('MWF 9:00 AM–9:50 AM')
    expect(formatMeeting(s(1, null, null, null))).toBe('TBA')
  })
})

describe('sectionsConflict', () => {
  it('detects overlap on a shared day', () => {
    expect(sectionsConflict(s(1, 'MWF', '09:00', '09:50'), s(2, 'M', '09:30', '10:30'))).toBe(true)
  })
  it('ignores different days', () => {
    expect(sectionsConflict(s(1, 'MWF', '09:00', '09:50'), s(2, 'TR', '09:00', '09:50'))).toBe(false)
  })
  it('treats back-to-back classes as no conflict', () => {
    expect(sectionsConflict(s(1, 'MWF', '09:00', '09:50'), s(2, 'MWF', '09:50', '10:40'))).toBe(false)
  })
  it('never conflicts with TBA', () => {
    expect(sectionsConflict(s(1, 'MWF', '09:00', '09:50'), s(2, null, null, null))).toBe(false)
  })
  it('conflictsWithAny skips the section itself', () => {
    const a = s(1, 'MWF', '09:00', '09:50')
    expect(conflictsWithAny(a, [a])).toBe(false)
    expect(conflictsWithAny(a, [a, s(2, 'W', '09:10', '09:20')])).toBe(true)
  })
})

describe('layoutCalendar', () => {
  it('puts overlapping blocks side by side and flags them', () => {
    const blocks = layoutCalendar([s(1, 'M', '09:00', '10:00'), s(2, 'M', '09:30', '10:30'), s(3, 'M', '11:00', '12:00')])
    const byId = Object.fromEntries(blocks.map((b) => [b.item.id, b]))
    expect(byId[1]).toMatchObject({ lane: 0, lanes: 2, conflict: true })
    expect(byId[2]).toMatchObject({ lane: 1, lanes: 2, conflict: true })
    expect(byId[3]).toMatchObject({ lane: 0, lanes: 1, conflict: false })
  })
  it('creates one block per meeting day and skips TBA', () => {
    const blocks = layoutCalendar([s(1, 'TR', '13:00', '14:15'), s(2, null, null, null)])
    expect(blocks.map((b) => b.day)).toEqual(['T', 'R'])
  })
})

describe('meetings', () => {
  const lec = { days: 'MWF', start_time: '09:00', end_time: '09:50', type: 'LEC' }
  const lab = { days: 'R', start_time: '13:00', end_time: '16:00', type: 'LAB' }
  const withMeetings = (id: number, meetings: object[]) => ({ id, days: 'MWF', start_time: '09:00', end_time: '09:50', meetings } as never)

  it('checks every meeting for conflicts (e.g. a lab)', () => {
    const a = withMeetings(1, [lec, lab])
    expect(sectionsConflict(a, s(2, 'R', '14:00', '15:00'))).toBe(true)
  })
  it('lets half-semester courses in different halves share a time slot', () => {
    const first = withMeetings(1, [{ ...lec, start_date: '2027-01-20', end_date: '2027-03-05' }])
    const second = withMeetings(2, [{ ...lec, start_date: '2027-03-22', end_date: '2027-05-07' }])
    expect(sectionsConflict(first, second)).toBe(false)
    const blocks = layoutCalendar([first, second] as never[])
    expect(blocks.every((b) => !b.conflict)).toBe(true)
  })
  it('lays out one block per meeting per day', () => {
    expect(layoutCalendar([withMeetings(1, [lec, lab])] as never[]).map((b) => b.day)).toEqual(['M', 'W', 'R', 'F'])
  })
  it('formats several meetings', () => {
    expect(formatMeeting(withMeetings(1, [lec, lab]))).toBe('MWF 9:00 AM–9:50 AM; R 1:00 PM–4:00 PM')
  })
})
