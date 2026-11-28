import { useEffect, useRef, useState } from 'react'
import { activeCount, cycleFilter, LEVELS, NO_FILTERS, TYPE_FILTERS, type Level, type SearchFilters } from '../lib/filters'
import { DAY_NAMES, type DayLetter } from '../lib/time'
import { FilterIcon } from './Icons'

const WEEKDAYS: DayLetter[] = ['M', 'T', 'W', 'R', 'F']
const SHORT_DAY: Record<string, string> = { M: 'M', T: 'Tu', W: 'W', R: 'Th', F: 'F' }
const START_OPTIONS = [8, 9, 10, 11, 12, 13].map((h) => h * 60)
const END_OPTIONS = [12, 13, 14, 15, 16, 17, 18, 19].map((h) => h * 60)
const hour = (m: number) => `${((Math.floor(m / 60) + 11) % 12) + 1} ${m < 720 ? 'AM' : 'PM'}`
const levelLabel = (l: Level) => (l === '400' ? '400+' : l)

function toggle<T>(set: ReadonlySet<T>, v: T): ReadonlySet<T> {
  const next = new Set(set)
  if (!next.delete(v)) next.add(v)
  return next
}

interface Props { filters: SearchFilters; onChange: (f: SearchFilters) => void }

/** The Filters button (with a count) and its panel. */
export function FiltersButton({ filters: f, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const count = activeCount(f)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  const set = (over: Partial<SearchFilters>) => onChange({ ...f, ...over })

  return (
    <div className="menu-wrap" ref={ref}>
      <button className={`icon-btn filter-btn${count ? ' on' : ''}`} onClick={() => setOpen((o) => !o)}
        aria-expanded={open} aria-label={count ? `Filters (${count} on)` : 'Filters'} title="Filters">
        <FilterIcon />{count > 0 && <span className="filter-count" aria-hidden="true">{count}</span>}
      </button>
      {open && (
        <div className="filter-panel" role="dialog" aria-label="Search filters">
          <div className="fp-head">
            <strong>Filters</strong>
            <span>
              {count > 0 && <button className="link" onClick={() => onChange(NO_FILTERS)}>Clear all</button>}
              <button className="link fp-done" onClick={() => setOpen(false)}>Done</button>
            </span>
          </div>

          <h4>When</h4>
          <div className="fp-row">
            <span className="fp-label">Days off</span>
            <div className="chips" role="group" aria-label="Days off: hide classes that meet on these days">
              {WEEKDAYS.map((d) => (
                <button key={d} className={f.daysOff.has(d) ? 'chip excluded' : 'chip'} aria-pressed={f.daysOff.has(d)}
                  aria-label={`No ${DAY_NAMES[d]}`} onClick={() => set({ daysOff: toggle(f.daysOff, d) })}>
                  {SHORT_DAY[d]}
                </button>
              ))}
            </div>
          </div>
          <div className="fp-row">
            <label className="fp-label" htmlFor="fp-start">Start after</label>
            <select id="fp-start" value={f.startAfter ?? ''} onChange={(e) => set({ startAfter: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Any time</option>
              {START_OPTIONS.map((m) => <option key={m} value={m}>{hour(m)}</option>)}
            </select>
            <label className="fp-label" htmlFor="fp-end">End by</label>
            <select id="fp-end" value={f.endBy ?? ''} onChange={(e) => set({ endBy: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Any time</option>
              {END_OPTIONS.map((m) => <option key={m} value={m}>{hour(m)}</option>)}
            </select>
          </div>

          <h4>Level</h4>
          <div className="chips" role="group" aria-label="Course level">
            {LEVELS.map((l) => (
              <button key={l} className={f.levels.has(l) ? 'chip active' : 'chip'} aria-pressed={f.levels.has(l)}
                onClick={() => set({ levels: toggle(f.levels, l) })}>{levelLabel(l)}</button>
            ))}
          </div>

          <h4>Course type <span className="muted small">click once for only these, twice to hide them</span></h4>
          <div className="chips" role="group" aria-label="Course type filters: click once to show only, twice to hide, three times to turn off">
            {TYPE_FILTERS.map((t) => {
              const state = f.types.get(t.id)
              return (
                <button key={t.id} className={`chip${state === 'include' ? ' active' : ''}${state === 'exclude' ? ' excluded' : ''}`}
                  aria-label={`${t.label}: ${state === 'include' ? 'showing only these' : state === 'exclude' ? 'hiding these' : 'off'}`}
                  onClick={() => set({ types: cycleFilter(f.types, t.id) })}>
                  {state === 'exclude' && <span aria-hidden="true">✕ </span>}{t.label}
                </button>
              )
            })}
          </div>

          <h4>Other</h4>
          <label className="menu-check fp-check">
            <input type="checkbox" checked={f.noPrereqs} onChange={(e) => set({ noPrereqs: e.target.checked })} />
            No prerequisites listed
          </label>
        </div>
      )}
    </div>
  )
}

/** One line under the search box listing the filters that are on, each removable. */
export function FilterSummary({ filters: f, onChange }: Props) {
  const items: { key: string; label: string; remove: () => void }[] = []
  const set = (over: Partial<SearchFilters>) => onChange({ ...f, ...over })
  for (const d of WEEKDAYS) if (f.daysOff.has(d)) items.push({ key: `d${d}`, label: `No ${DAY_NAMES[d]}`, remove: () => set({ daysOff: toggle(f.daysOff, d) }) })
  if (f.startAfter != null) items.push({ key: 'start', label: `After ${hour(f.startAfter)}`, remove: () => set({ startAfter: null }) })
  if (f.endBy != null) items.push({ key: 'end', label: `Done by ${hour(f.endBy)}`, remove: () => set({ endBy: null }) })
  for (const l of LEVELS) if (f.levels.has(l)) items.push({ key: `l${l}`, label: `${levelLabel(l)}-level`, remove: () => set({ levels: toggle(f.levels, l) }) })
  for (const t of TYPE_FILTERS) {
    const state = f.types.get(t.id)
    if (!state) continue
    const types = new Map(f.types); types.delete(t.id)
    items.push({ key: t.id, label: state === 'exclude' ? `No ${t.label}` : t.label, remove: () => set({ types }) })
  }
  if (f.noPrereqs) items.push({ key: 'prereq', label: 'No prereqs', remove: () => set({ noPrereqs: false }) })
  if (!items.length) return null
  return (
    <ul className="filter-summary" aria-label="Filters on">
      {items.map((i) => (
        <li key={i.key}>
          {i.label}
          <button onClick={i.remove} aria-label={`Remove filter: ${i.label}`}>✕</button>
        </li>
      ))}
    </ul>
  )
}
