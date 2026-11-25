import type { ReactNode } from 'react'
import { layoutCalendar, toMinutes, type DayLetter } from '../lib/time'
import { darken } from '../lib/theme'
import type { SectionWithCourse } from '../lib/types'
import { ListIcon } from './Icons'

const DAYS: { letter: DayLetter; name: string }[] = [
  { letter: 'M', name: 'Monday' }, { letter: 'T', name: 'Tuesday' }, { letter: 'W', name: 'Wednesday' },
  { letter: 'R', name: 'Thursday' }, { letter: 'F', name: 'Friday' },
]
const WEEKEND: { letter: DayLetter; name: string }[] = [{ letter: 'S', name: 'Saturday' }, { letter: 'U', name: 'Sunday' }]

/** "08:30:00" -> "8:30" (12-hour, no AM/PM, like a compact timetable). */
function short(t: string): string {
  const m = toMinutes(t)
  return `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')}`
}

interface Props {
  sections: SectionWithCourse[]
  preview: SectionWithCourse[] // faded blocks: hovered search result, or other sections to switch to
  pickingCourseId: number | null // when set, faded blocks are clickable sections of this course
  colorOf: (courseId: number) => string
  onOpen: (sectionId: number) => void
  notice?: ReactNode
}

export default function Calendar({ sections, preview, pickingCourseId, colorOf, onOpen, notice }: Props) {
  const previewIds = new Set(preview.map((s) => s.id))
  const all = [...sections, ...preview.filter((s) => !sections.some((x) => x.id === s.id))]
  const blocks = layoutCalendar(all)
  const days = [...DAYS, ...WEEKEND.filter((d) => blocks.some((b) => b.day === d.letter))]

  // Visible range: 8:00 AM – 9:00 PM, widened if a class falls outside it.
  const startMin = Math.min(8 * 60, ...blocks.map((b) => Math.floor(b.start / 60) * 60))
  const endMin = Math.max(21 * 60, ...blocks.map((b) => Math.ceil(b.end / 60) * 60))
  const span = endMin - startMin
  const lines: number[] = []
  for (let m = startMin + 60; m < endMin; m += 60) lines.push(m)
  const pct = (m: number) => `${((m - startMin) / span) * 100}%`

  return (
    <section className="cal" aria-label="Weekly calendar">
      {notice}
      <div className="cal-head" style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
        <span className="cal-corner"><ListIcon /></span>
        {days.map((d) => <div key={d.letter}>{d.name}</div>)}
      </div>
      <div className="cal-body" style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
        {days.map((d) => (
          <div key={d.letter} className="cal-col">
            {lines.map((m) => <div key={m} className="cal-line" style={{ top: pct(m) }} />)}
            {blocks.filter((b) => b.day === d.letter).map((b) => {
              const s = b.item
              const m = b.meeting
              const isPreview = previewIds.has(s.id) && !sections.some((x) => x.id === s.id)
              const isChoice = isPreview && pickingCourseId === s.course.id
              const isPicked = !isPreview && pickingCourseId === s.course.id
              const color = isPreview && !isChoice ? '#c9ced6' : colorOf(s.course.id)
              return (
                <button
                  key={`${s.id}-${d.letter}-${b.start}-${m.type ?? ''}`}
                  className={`ev${isPreview ? ' preview' : ''}${isChoice ? ' choice' : ''}${isPicked ? ' picked' : ''}${b.conflict && !isPreview ? ' conflict' : ''}${s.status === 'canceled' ? ' canceled' : ''}`}
                  style={{
                    top: pct(b.start),
                    height: `${((b.end - b.start) / span) * 100}%`,
                    left: `calc(${(b.lane / b.lanes) * 100}% + 2px)`,
                    width: `calc(${100 / b.lanes}% - 4px)`,
                    background: color,
                    borderLeftColor: darken(color),
                  }}
                  onClick={() => onOpen(s.id)}
                  tabIndex={isPreview && !isChoice ? -1 : 0}
                  aria-label={isChoice ? `Switch to ${s.course.code}-${s.section}` : undefined}
                  title={`${s.course.code}-${s.section} ${s.course.title}`}
                >
                  <span className="ev-time">{short(m.start_time)}-{short(m.end_time)}</span>
                  <span className="ev-code">{s.course.code}-{s.section}{m.type && m.type !== 'LEC' ? ` ${m.type}` : ''}</span>
                  {s.instructors.length > 0 && <span className="ev-extra">{s.instructors.join(', ')}</span>}
                  {(m.building || m.room) && <span className="ev-extra">{[m.building, m.room].filter(Boolean).join(' ')}</span>}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </section>
  )
}
