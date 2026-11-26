import type { Meeting, SectionWithCourse, Term } from './types'
import { DAY_TO_JS, meetingsOf, parseDays, type DayLetter } from './time'

const TZID = 'America/New_York'
const ICAL_DAY: Record<DayLetter, string> = { M: 'MO', T: 'TU', W: 'WE', R: 'TH', F: 'FR', S: 'SA', U: 'SU' }
/** Final exams: Colleague codes them FINAL; accept close variants and any letter case. */
const isExam = (m: Meeting) => /^(final|fin|exam)/i.test(m.type ?? '')

// Standard US Eastern time zone definition, so calendar apps place events correctly.
const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${TZID}`,
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:-0500',
  'TZOFFSETTO:-0400',
  'TZNAME:EDT',
  'DTSTART:19700308T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:-0400',
  'TZOFFSETTO:-0500',
  'TZNAME:EST',
  'DTSTART:19701101T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
]

/** Parse "YYYY-MM-DD" as a calendar date (no time zone shifting). */
function parseDate(d: string): Date {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day))
}
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10).replaceAll('-', '')
}
function fmtTime(t: string): string {
  const [h, m] = t.split(':')
  return `${h.padStart(2, '0')}${m.padStart(2, '0')}00`
}

/** Escape text per RFC 5545. */
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Fold lines longer than 75 octets (RFC 5545 §3.1). */
function fold(line: string): string {
  if (new TextEncoder().encode(line).length <= 75) return line
  const parts: string[] = []
  let current = ''
  let size = 0
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length
    const limit = parts.length === 0 ? 75 : 74 // continuation lines start with a space
    if (size + n > limit) { parts.push(current); current = ''; size = 0 }
    current += ch
    size += n
  }
  parts.push(current)
  return parts.join('\r\n ')
}

/** First date on or after `start` that falls on one of `days`. */
export function firstMeetingDate(start: string, days: DayLetter[]): Date | null {
  const wanted = new Set(days.map((d) => DAY_TO_JS[d]))
  if (!wanted.size) return null
  const d = parseDate(start)
  for (let i = 0; i < 7; i++) {
    if (wanted.has(d.getUTCDay())) return d
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return null
}

/** End of the given day, expressed in UTC as RFC 5545 requires with a TZID start. */
function untilOf(endDate: string): string {
  const until = new Date(parseDate(endDate).getTime() + 24 * 3600_000 + 4 * 3600_000 - 1000)
  return until.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/**
 * Build an .ics calendar: one weekly repeating event per meeting of each section
 * (a lecture and a lab become two events), running over the meeting's own dates
 * (or the term's), skipping the term's no-class dates. TBA and canceled sections are left out.
 */
export function buildIcs(term: Term, sections: SectionWithCourse[], now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HamApps//Hamilton Scheduler//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(`${term.name} classes`)}`,
    ...VTIMEZONE,
  ]

  for (const s of sections) {
    if (s.status === 'canceled') continue
    meetingsOf(s).forEach((m: Meeting, i) => {
      const days = parseDays(m.days)
      const startDate = m.start_date ?? term.start_date
      // Safety net (the importer already fixes known cases): a regular class that starts during the term
      // stops at the last day of classes, even if Self-Service dated it through exam week. Exams, and
      // anything that starts after classes end, keep their own dates.
      const ownEnd = m.end_date ?? term.end_date
      const cut = !isExam(m) && startDate <= term.end_date && ownEnd > term.end_date
      const endDate = cut ? term.end_date : ownEnd
      const first = firstMeetingDate(startDate, days)
      if (!first || fmtDate(first) > endDate.replaceAll('-', '')) return

      const location = [m.building, m.room].filter(Boolean).join(' ')
      const description = [
        s.course.title,
        m.type && m.type !== 'LEC' ? `Type: ${m.type}` : '',
        s.instructors.length ? `Instructor: ${s.instructors.join(', ')}` : '',
        s.course.catalog_url ?? '',
      ].filter(Boolean).join('\n')
      const suffix = m.type && m.type !== 'LEC' ? ` (${m.type})` : ''

      lines.push(
        'BEGIN:VEVENT',
        `UID:${term.id}-${s.id}-${i}@hamilton-scheduler.hamapps`,
        `DTSTAMP:${stamp}`,
        `SUMMARY:${esc(`${s.course.code}-${s.section}${suffix} ${s.course.title}`)}`,
        `DTSTART;TZID=${TZID}:${fmtDate(first)}T${fmtTime(m.start_time)}`,
        `DTEND;TZID=${TZID}:${fmtDate(first)}T${fmtTime(m.end_time)}`,
        `RRULE:FREQ=WEEKLY;BYDAY=${days.map((d) => ICAL_DAY[d]).join(',')};UNTIL=${untilOf(endDate)}`,
      )
      const skipped = term.no_class_dates
        .filter((d) => d >= startDate && d <= endDate)
        .filter((d) => days.some((day) => DAY_TO_JS[day] === parseDate(d).getUTCDay()))
        .sort()
      if (skipped.length) {
        lines.push(`EXDATE;TZID=${TZID}:${skipped.map((d) => `${d.replaceAll('-', '')}T${fmtTime(m.start_time)}`).join(',')}`)
      }
      if (location) lines.push(`LOCATION:${esc(location)}`)
      lines.push(`DESCRIPTION:${esc(description)}`, 'END:VEVENT')
    })
  }

  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** Trigger a download of the .ics file in the browser. */
export function downloadIcs(filename: string, ics: string): void {
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
