import { useEffect } from 'react'
import { formatTime, meetingsOf, parseDays, sectionsConflict } from '../lib/time'
import type { SectionWithCourse } from '../lib/types'

interface Props {
  section: SectionWithCourse
  inSchedule: boolean
  conflicts: SectionWithCourse[] // other sections currently on the calendar
  canAdd: boolean
  onToggle: () => void
  onClose: () => void
}

export default function DetailsPanel({ section: s, inSchedule, conflicts, canAdd, onToggle, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const clashes = conflicts.filter((o) => sectionsConflict(s, o))
  const c = s.course
  const meetings = meetingsOf(s)
  const shortDate = (d?: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '')

  return (
    <div className="overlay" onClick={onClose}>
      <aside className="details" role="dialog" aria-modal="true" aria-label={`${c.code}-${s.section} details`} onClick={(e) => e.stopPropagation()}>
        <button className="close ghost" onClick={onClose} aria-label="Close">✕</button>
        <h2>{c.code}-{s.section}</h2>
        <p className="title">{c.title}</p>

        <dl>
          <dt>When</dt>
          <dd>
            {meetings.length === 0 ? 'TBA' : meetings.map((m, i) => (
              <div key={i}>
                {parseDays(m.days).join('')} {formatTime(m.start_time)}–{formatTime(m.end_time)}
                {m.type && m.type !== 'LEC' ? ` (${m.type})` : ''}
                {[m.building, m.room].filter(Boolean).length > 0 && ` · ${[m.building, m.room].filter(Boolean).join(' ')}`}
                {m.start_date && m.end_date && <span className="muted"> · {shortDate(m.start_date)}–{shortDate(m.end_date)}</span>}
              </div>
            ))}
          </dd>
          <dt>Instructor</dt><dd>{s.instructors.join(', ') || 'Staff'}</dd>
          <dt>Status</dt><dd><span className={`pill ${s.status}`}>{s.status}</span></dd>
          {s.capacity != null && <><dt>Capacity</dt><dd>{s.capacity}</dd></>}
          {c.credits != null && <><dt>Credits</dt><dd>{c.credits}</dd></>}
          {c.department && <><dt>Department</dt><dd>{c.department}</dd></>}
          {c.cross_listed.length > 0 && <><dt>Cross-listed</dt><dd>{c.cross_listed.join(', ')}</dd></>}
        </dl>

        {clashes.length > 0 && (
          <p className="warn">Conflicts with {clashes.map((o) => `${o.course.code}-${o.section}`).join(', ')}.</p>
        )}
        {s.comments && <p className="warn">{s.comments}</p>}
        {c.description && <p className="desc">{c.description}</p>}
        {c.catalog_url && <p><a href={c.catalog_url} target="_blank" rel="noreferrer">View in course catalog ↗</a></p>}

        <button
          className={inSchedule ? 'danger' : 'primary'}
          onClick={onToggle}
          disabled={!canAdd || (!inSchedule && s.status === 'canceled')}
        >
          {inSchedule ? 'Remove from schedule' : 'Add to schedule'}
        </button>
      </aside>
    </div>
  )
}
