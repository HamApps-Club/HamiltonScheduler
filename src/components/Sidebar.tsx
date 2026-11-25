import { useEffect, useMemo, useRef, useState } from 'react'
import { conflictsWithAny } from '../lib/time'
import { darken } from '../lib/theme'
import type { Course, SectionWithCourse } from '../lib/types'
import { BookIcon, ChevronsDownIcon, GearIcon, InfoIcon, MinusIcon, PlusIcon, ShareIcon } from './Icons'

export interface SavedCourse { course: Course; color: string; sections: SectionWithCourse[] }

interface Props {
  courses: Course[]
  saved: SavedCourse[]
  scheduled: SectionWithCourse[]
  canEdit: boolean
  canExport: boolean
  onAdd: (course: Course) => void
  onRemove: (course: Course) => void
  onDetails: (sectionId: number) => void
  onPreview: (course: Course | null) => void
  onExport: () => void
}

const MAX_RESULTS = 100

function matches(course: Course, q: string): boolean {
  const hay = [course.code, course.code.replace(/\s+/g, ''), course.title, course.department ?? '',
    ...course.cross_listed, ...course.sections.flatMap((s) => s.instructors)].join(' ').toLowerCase()
  return q.split(/\s+/).every((word) => hay.includes(word))
}

function CourseLinks({ course, onDetails }: { course: Course; onDetails: () => void }) {
  return (
    <>
      <button className="card-link" onClick={onDetails}><span>Details</span><InfoIcon /></button>
      {course.catalog_url ? (
        <a className="card-link" href={course.catalog_url} target="_blank" rel="noreferrer">
          <span>Hamilton Catalog</span><BookIcon />
        </a>
      ) : (
        <span className="card-link disabled" title="This course isn't listed in the Hamilton course catalog"><span>Hamilton Catalog</span><BookIcon /></span>
      )}
    </>
  )
}

export default function Sidebar(p: Props) {
  const [query, setQuery] = useState('')
  const [noConflicts, setNoConflicts] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [hideCanceled, setHideCanceled] = useState(true)
  const [hideClosed, setHideClosed] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)
  const settingsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!settingsOpen) return
    const close = (e: MouseEvent) => { if (!settingsRef.current?.contains(e.target as Node)) setSettingsOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [settingsOpen])

  const savedIds = useMemo(() => new Set(p.saved.map((s) => s.course.id)), [p.saved])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return p.courses.filter((c) => {
      if (savedIds.has(c.id) || !matches(c, q)) return false
      let secs = c.sections
      if (hideCanceled) secs = secs.filter((s) => s.status !== 'canceled')
      if (hideClosed) secs = secs.filter((s) => s.status !== 'closed')
      if (noConflicts) secs = secs.filter((s) => !conflictsWithAny(s, p.scheduled))
      return secs.length > 0
    })
  }, [query, p.courses, p.scheduled, savedIds, noConflicts, hideCanceled, hideClosed])

  const firstSectionId = (c: Course) => (c.sections.find((s) => s.status !== 'canceled') ?? c.sections[0])?.id

  return (
    <aside className="side" aria-label="Courses">
      <div className="seg">
        <button className={!noConflicts ? 'seg-btn active' : 'seg-btn'} onClick={() => setNoConflicts(false)}>Show All</button>
        <button className={noConflicts ? 'seg-btn active' : 'seg-btn'} onClick={() => setNoConflicts(true)}>No Conflicts</button>
      </div>

      <div className="search-row">
        <input type="search" placeholder="Search..." value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search courses" />
        <div className="menu-wrap" ref={settingsRef}>
          <button className="icon-btn" onClick={() => setSettingsOpen((o) => !o)} aria-label="Search settings" aria-expanded={settingsOpen}>
            <GearIcon />
          </button>
          {settingsOpen && (
            <div className="menu right">
              <label className="menu-check"><input type="checkbox" checked={hideCanceled} onChange={(e) => setHideCanceled(e.target.checked)} /> Hide canceled</label>
              <label className="menu-check"><input type="checkbox" checked={hideClosed} onChange={(e) => setHideClosed(e.target.checked)} /> Hide closed</label>
            </div>
          )}
        </div>
      </div>

      <div className="side-head">
        <h3>0 Custom Events</h3>
        <button className="text-btn" disabled title="Custom events are coming soon"><ChevronsDownIcon /> Show</button>
      </div>

      <div className="side-head">
        <h3>{p.saved.length} Saved Course{p.saved.length === 1 ? '' : 's'}</h3>
        <button className="text-btn" onClick={p.onExport} disabled={!p.canExport} title="Export to Google Calendar (.ics)">
          <ShareIcon /> Export
        </button>
      </div>

      <ul className="cards">
        {p.saved.map(({ course, color, sections }) => {
          const open = expanded === course.id
          return (
            <li key={course.id} className="card saved" style={{ background: color, borderLeftColor: darken(color) }}>
              <div className="card-main">
                <button className="card-body" onClick={() => setExpanded(open ? null : course.id)} aria-expanded={open}>
                  <span className="card-code">{[course.code, ...course.cross_listed].join(' / ')}</span>
                  <span className="card-title">{course.title}</span>
                </button>
                <button className="card-act" onClick={() => p.onRemove(course)} disabled={!p.canEdit} aria-label={`Remove ${course.code}`}>
                  <MinusIcon />
                </button>
              </div>
              {open && <CourseLinks course={course} onDetails={() => p.onDetails(sections[0]?.id ?? firstSectionId(course)!)} />}
            </li>
          )
        })}
      </ul>

      {query.trim() && (
        <>
          <div className="divider"><span /></div>
          <div className="side-head"><h3>{results.length} Search Result{results.length === 1 ? '' : 's'}</h3></div>
          <ul className="cards results">
            {results.slice(0, MAX_RESULTS).map((course) => {
              const open = expanded === course.id
              return (
                <li key={course.id} className="card result"
                  onMouseEnter={() => p.onPreview(course)} onMouseLeave={() => p.onPreview(null)}>
                  <div className="card-main">
                    <button className="card-body" onClick={() => setExpanded(open ? null : course.id)} aria-expanded={open}>
                      <span className="card-code">{[course.code, ...course.cross_listed].join(' / ')}</span>
                      <span className="card-title">{course.title}</span>
                    </button>
                    <button className="card-act" onClick={() => { p.onPreview(null); p.onAdd(course) }} disabled={!p.canEdit} aria-label={`Add ${course.code}`}>
                      <PlusIcon />
                    </button>
                  </div>
                  {open && <CourseLinks course={course} onDetails={() => p.onDetails(firstSectionId(course)!)} />}
                </li>
              )
            })}
            {results.length > MAX_RESULTS && <li className="muted small pad">Showing the first {MAX_RESULTS}. Keep typing to narrow.</li>}
          </ul>
        </>
      )}
    </aside>
  )
}
