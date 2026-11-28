import { useMemo, useState } from 'react'
import { conflictsWithAny } from '../lib/time'
import { TYPE_FILTERS, cycleFilter, matchesTypes, type TypeFilters } from '../lib/filters'
import type { LabIndex } from '../lib/labs'
import { darken } from '../lib/theme'
import type { Course, Section, SectionWithCourse } from '../lib/types'
import { BookIcon, ChevronsDownIcon, InfoIcon, MinusIcon, PlusIcon, ShareIcon } from './Icons'
import Requisite from './Requisite'

/** A course card: the class plus its lab (`courseIds` lists both), in one color. */
export interface SavedCourse { course: Course; color: string; sections: SectionWithCourse[]; courseIds: number[] }

interface Props {
  courses: Course[]
  labs: LabIndex
  query: string
  onQuery: (q: string) => void
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

const available = (c: Course) => c.sections.filter((s) => s.status !== 'canceled')

function matches(course: Course, labs: Course[], q: string): boolean {
  const codes = [course.code, ...course.cross_listed, ...labs.map((l) => l.code)]
  const hay = [...codes, ...codes.map((c) => c.replace(/\s+/g, '')), course.title, course.department ?? '',
    ...course.sections.flatMap((s) => s.instructors)].join(' ').toLowerCase()
  return q.split(/\s+/).every((word) => hay.includes(word))
}

/** "Includes lab" line under a card's title. */
function LabNote({ labs }: { labs: Course[] }) {
  if (!labs.length) return null
  return <span className="card-lab">Includes lab: {labs.map((l) => l.code).join(', ')}</span>
}

function CourseLinks({ course, onDetails, onSearch }: { course: Course; onDetails: () => void; onSearch: (q: string) => void }) {
  return (
    <>
      {(course.prerequisites || course.corequisites) && (
        <div className="card-reqs">
          {course.prerequisites && <p><strong>Prerequisites:</strong> <Requisite text={course.prerequisites} onSearch={onSearch} /></p>}
          {course.corequisites && <p><strong>Corequisites:</strong> <Requisite text={course.corequisites} onSearch={onSearch} /></p>}
        </div>
      )}
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
  const { query, onQuery: setQuery } = p
  const [noConflicts, setNoConflicts] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [typeFilters, setTypeFilters] = useState<TypeFilters>(new Map())

  const savedIds = useMemo(() => new Set(p.saved.flatMap((s) => s.courseIds)), [p.saved])
  const labsOf = (c: Course) => p.labs.labsOf.get(c.id) ?? []

  // With a type filter on, an empty search lists every matching course.
  const showResults = query.trim() !== '' || typeFilters.size > 0

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q && typeFilters.size === 0) return []
    const fits = (s: Section) => !noConflicts || !conflictsWithAny(s, p.scheduled)
    return p.courses.filter((c) => {
      // Labs that belong to a class are shown inside that class's card, not on their own.
      if (savedIds.has(c.id) || p.labs.classesOf.has(c.id)) return false
      const labs = p.labs.labsOf.get(c.id) ?? []
      if (q && !matches(c, labs, q)) return false
      let secs = available(c)
      if (typeFilters.size) secs = secs.filter((s) => matchesTypes(s, typeFilters))
      if (!secs.some(fits)) return false
      // "No Conflicts": a class with a lab also needs a lab time that fits.
      return labs.every((l) => savedIds.has(l.id) || available(l).some(fits))
    })
  }, [query, p.courses, p.scheduled, p.labs, savedIds, noConflicts, typeFilters])

  const firstSectionId = (c: Course) => (available(c)[0] ?? c.sections[0])?.id
  const search = (code: string) => { setQuery(code); setExpanded(null) }

  return (
    <aside className="side" aria-label="Courses">
      <div className="seg">
        <button className={!noConflicts ? 'seg-btn active' : 'seg-btn'} onClick={() => setNoConflicts(false)}>Show All</button>
        <button className={noConflicts ? 'seg-btn active' : 'seg-btn'} onClick={() => setNoConflicts(true)}>No Conflicts</button>
      </div>

      <div className="search-row">
        <input type="search" placeholder="Search..." value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search courses" />
      </div>

      <div className="chips" role="group" aria-label="Course type filters: click once to show only, twice to hide, three times to turn off">
        {TYPE_FILTERS.map((f) => {
          const state = typeFilters.get(f.id)
          return (
            <button key={f.id} className={`chip${state === 'include' ? ' active' : ''}${state === 'exclude' ? ' excluded' : ''}`}
              aria-label={`${f.label}: ${state === 'include' ? 'showing only these' : state === 'exclude' ? 'hiding these' : 'off'}`}
              title={state === 'include' ? 'Click again to hide these instead' : state === 'exclude' ? 'Click again to turn off' : 'Click to show only these; twice to hide them'}
              onClick={() => setTypeFilters((prev) => cycleFilter(prev, f.id))}>
              {state === 'exclude' && <span aria-hidden="true">✕ </span>}{f.label}
            </button>
          )
        })}
        {typeFilters.size > 0 && <button className="chip clear" onClick={() => setTypeFilters(new Map())}>Clear</button>}
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
                  <LabNote labs={[...new Map(sections.filter((s) => s.course.id !== course.id).map((s) => [s.course.id, s.course])).values()]} />
                </button>
                <button className="card-act" onClick={() => p.onRemove(course)} disabled={!p.canEdit} aria-label={`Remove ${course.code}`}>
                  <MinusIcon />
                </button>
              </div>
              {open && <CourseLinks course={course} onSearch={search} onDetails={() => p.onDetails(sections[0]?.id ?? firstSectionId(course)!)} />}
            </li>
          )
        })}
      </ul>

      {showResults && (
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
                      <LabNote labs={labsOf(course)} />
                    </button>
                    <button className="card-act" onClick={() => { p.onPreview(null); p.onAdd(course) }} disabled={!p.canEdit} aria-label={`Add ${course.code}`}>
                      <PlusIcon />
                    </button>
                  </div>
                  {open && <CourseLinks course={course} onSearch={search} onDetails={() => p.onDetails(firstSectionId(course)!)} />}
                </li>
              )
            })}
            {results.length > MAX_RESULTS && <li className="muted small pad">Showing the first {MAX_RESULTS}. {query.trim() ? 'Keep typing' : 'Search or add a filter'} to narrow.</li>}
          </ul>
        </>
      )}
    </aside>
  )
}
