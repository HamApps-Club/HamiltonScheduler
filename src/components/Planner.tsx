import { useCallback, useEffect, useMemo, useState } from 'react'
import * as api from '../lib/api'
import { buildIcs, downloadIcs } from '../lib/ics'
import { applyMode, initialMode, loadPref, PALETTES, savePref, type Mode } from '../lib/theme'
import { MAX_SCHEDULES_PER_TERM, type Course, type Schedule, type SectionWithCourse, type Term } from '../lib/types'
import Header from './Header'
import Sidebar, { type SavedCourse } from './Sidebar'
import Calendar from './Calendar'
import DetailsPanel from './DetailsPanel'
import { CalendarIcon, PencilIcon, PlusIcon } from './Icons'

export default function Planner() {
  const [terms, setTerms] = useState<Term[]>([])
  const [termId, setTermId] = useState<string | null>(null)
  const [catalog, setCatalog] = useState<Course[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [scheduleId, setScheduleId] = useState<number | null>(null)
  const [sectionIds, setSectionIds] = useState<number[]>([])
  const [detailId, setDetailId] = useState<number | null>(null)
  const [previewCourse, setPreviewCourse] = useState<Course | null>(null)
  const [pickCourseId, setPickCourseId] = useState<number | null>(null) // choosing another section of this course
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>(initialMode)
  const [paletteIndex, setPaletteIndex] = useState(() => Number(loadPref('hs-palette')) || 0)

  useEffect(() => applyMode(mode), [mode])
  useEffect(() => savePref('hs-palette', String(paletteIndex)), [paletteIndex])

  const run = useCallback(async (fn: () => Promise<void>) => {
    setError(null)
    try { await fn() } catch (e) { setError(api.friendlyError(e)) }
  }, [])

  // First load: make sure default schedules exist, then load semesters.
  useEffect(() => {
    run(async () => {
      await api.ensureDefaultSchedules()
      const t = await api.fetchTerms()
      setTerms(t)
      const active = t.filter((x) => x.is_active)
      setTermId((active[active.length - 1] ?? t[t.length - 1])?.id ?? null)
    })
  }, [run])

  // Semester changed: load its catalog and the student's schedules.
  useEffect(() => {
    if (!termId) return
    let stale = false
    setDetailId(null); setPickCourseId(null); setCatalog([]); setSchedules([]); setScheduleId(null)
    run(async () => {
      const [c, s] = await Promise.all([api.fetchCatalog(termId), api.fetchSchedules(termId)])
      if (stale) return
      setCatalog(c); setSchedules(s); setScheduleId(s[0]?.id ?? null)
    })
    return () => { stale = true }
  }, [termId, run])

  // Schedule changed: load its sections.
  useEffect(() => {
    setSectionIds([])
    setPickCourseId(null)
    if (!scheduleId) return
    let stale = false
    run(async () => {
      const ids = await api.fetchScheduleSectionIds(scheduleId)
      if (!stale) setSectionIds(ids)
    })
    return () => { stale = true }
  }, [scheduleId, run])

  const sectionsById = useMemo(() => {
    const m = new Map<number, SectionWithCourse>()
    for (const course of catalog) for (const s of course.sections) m.set(s.id, { ...s, course })
    return m
  }, [catalog])

  const scheduled = useMemo(
    () => sectionIds.map((id) => sectionsById.get(id)).filter((s): s is SectionWithCourse => !!s),
    [sectionIds, sectionsById],
  )

  // Saved courses, in the order they were added, each with its palette color.
  const palette = PALETTES[paletteIndex] ?? PALETTES[0]
  const saved: SavedCourse[] = useMemo(() => {
    const out: SavedCourse[] = []
    for (const s of scheduled) {
      const existing = out.find((x) => x.course.id === s.course.id)
      if (existing) existing.sections.push(s)
      else out.push({ course: s.course, color: palette.colors[out.length % palette.colors.length], sections: [s] })
    }
    return out
  }, [scheduled, palette])
  const colorOf = useCallback((courseId: number) => saved.find((x) => x.course.id === courseId)?.color ?? palette.colors[0], [saved, palette])

  const pickCourse = pickCourseId ? catalog.find((c) => c.id === pickCourseId) ?? null : null

  // Faded blocks: the other sections of the course being switched, else the hovered search result.
  const preview = useMemo(() => {
    if (pickCourse) {
      return pickCourse.sections.filter((s) => s.status !== 'canceled' && !sectionIds.includes(s.id)).map((s) => ({ ...s, course: pickCourse }))
    }
    return previewCourse ? previewCourse.sections.filter((s) => s.status !== 'canceled').map((s) => ({ ...s, course: previewCourse })) : []
  }, [pickCourse, previewCourse, sectionIds])

  // Esc leaves section-picking mode.
  useEffect(() => {
    if (!pickCourseId) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPickCourseId(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pickCourseId])

  const term = terms.find((t) => t.id === termId) ?? null
  const schedule = schedules.find((s) => s.id === scheduleId) ?? null

  async function addSectionById(id: number) {
    if (!scheduleId || sectionIds.includes(id)) return
    await run(async () => { await api.addSection(scheduleId, id); setSectionIds((ids) => [...ids, id]) })
  }
  async function removeSectionById(id: number) {
    if (!scheduleId) return
    await run(async () => { await api.removeSection(scheduleId, id); setSectionIds((ids) => ids.filter((x) => x !== id)) })
  }

  /** Add a course: its first open (non-canceled) section. Other sections can be chosen from Details. */
  async function addCourse(course: Course) {
    const s = course.sections.find((x) => x.status === 'open') ?? course.sections.find((x) => x.status !== 'canceled')
    if (!s) return setNotice(`${course.code} has no available sections.`)
    await addSectionById(s.id)
  }
  /** Replace whichever section of `course` is on the schedule with `newId`. */
  async function switchSection(course: Course, newId: number) {
    if (!scheduleId) return
    const old = sectionIds.filter((id) => sectionsById.get(id)?.course.id === course.id)
    await run(async () => {
      await api.addSection(scheduleId, newId)
      for (const id of old) await api.removeSection(scheduleId, id)
      setSectionIds((all) => [...all.filter((x) => !old.includes(x)), newId])
    })
  }

  /** Calendar block clicked (TigerJunction style). */
  function onBlockClick(id: number) {
    const sec = sectionsById.get(id)
    if (!sec) return
    const course = sec.course
    if (pickCourseId === course.id) {
      setPickCourseId(null)
      if (sectionIds.includes(id)) setDetailId(id) // clicked the current section again
      else void switchSection(course, id)          // clicked another section: switch to it
      return
    }
    const choices = course.sections.filter((s) => s.status !== 'canceled')
    if (sectionIds.includes(id) && choices.length > 1) setPickCourseId(course.id)
    else setDetailId(id)
  }

  async function removeCourse(course: Course) {
    if (!scheduleId) return
    const ids = sectionIds.filter((id) => sectionsById.get(id)?.course.id === course.id)
    await run(async () => {
      for (const id of ids) await api.removeSection(scheduleId, id)
      setSectionIds((all) => all.filter((x) => !ids.includes(x)))
    })
  }

  async function newSchedule() {
    if (!termId) return
    const name = window.prompt('Name for the new schedule:', `Schedule ${schedules.length + 1}`)
    if (!name?.trim()) return
    await run(async () => {
      const s = await api.createSchedule(termId, name)
      setSchedules((list) => [...list, s]); setScheduleId(s.id)
    })
  }
  async function editSchedule(s: Schedule) {
    const name = window.prompt(`Rename "${s.name}" (leave empty to delete it):`, s.name)
    if (name === null) return
    if (!name.trim()) {
      if (!window.confirm(`Delete "${s.name}"? This can't be undone.`)) return
      return run(async () => {
        await api.deleteSchedule(s.id)
        const rest = schedules.filter((x) => x.id !== s.id)
        setSchedules(rest); setScheduleId(rest[0]?.id ?? null)
      })
    }
    if (name.trim() === s.name) return
    await run(async () => {
      await api.renameSchedule(s.id, name)
      setSchedules((list) => list.map((x) => (x.id === s.id ? { ...x, name: name.trim() } : x)))
    })
  }

  function exportIcs() {
    if (!term || !schedule) return
    const safe = `${term.name} ${schedule.name}`.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-')
    downloadIcs(`${safe || 'schedule'}.ics`, buildIcs(term, scheduled))
  }

  const detail = detailId ? sectionsById.get(detailId) ?? null : null
  const canExport = scheduled.some((s) => s.days && s.start_time)

  return (
    <div className="shell">
      <Header mode={mode} onToggleMode={() => setMode((m) => (m === 'dark' ? 'light' : 'dark'))}
        paletteIndex={paletteIndex} onPalette={setPaletteIndex} />

      {(error || notice) && (
        <div className="banner" role="alert">
          {error ?? notice} <button className="link" onClick={() => { setError(null); setNotice(null) }}>Dismiss</button>
        </div>
      )}

      <div className="bars">
        <div className="bars-left">
          <nav className="pillbar" aria-label="Semesters">
            {terms.map((t) => (
              <button key={t.id} className={t.id === termId ? 'pill-tab active' : 'pill-tab'} onClick={() => setTermId(t.id)}>
                {t.name}
              </button>
            ))}
          </nav>
          <nav className="pillbar" aria-label="Schedules">
            {schedules.map((s) => (
              <span key={s.id} className={s.id === scheduleId ? 'pill-tab active sched' : 'pill-tab sched'}>
                <button className="sched-name" onClick={() => setScheduleId(s.id)}>{s.name}</button>
                {s.id === scheduleId && (
                  <button className="sched-edit" onClick={() => editSchedule(s)} aria-label={`Rename or delete ${s.name}`}><PencilIcon /></button>
                )}
              </span>
            ))}
            {schedules.length < MAX_SCHEDULES_PER_TERM && termId && (
              <button className="pill-tab icon" onClick={newSchedule} aria-label="New schedule"><PlusIcon /></button>
            )}
          </nav>
        </div>
        <button className="events-btn" onClick={() => setNotice('Custom events are coming soon.')}>
          <CalendarIcon /> Manage Events
        </button>
      </div>

      <main className="main">
        <Sidebar
          courses={catalog}
          saved={saved}
          scheduled={scheduled}
          canEdit={!!scheduleId}
          canExport={canExport}
          onAdd={addCourse}
          onRemove={removeCourse}
          onDetails={setDetailId}
          onPreview={setPreviewCourse}
          onExport={exportIcs}
        />
        <Calendar
          sections={scheduled}
          preview={preview}
          pickingCourseId={pickCourseId}
          colorOf={colorOf}
          onOpen={onBlockClick}
          notice={pickCourse && (
            <div className="pick-bar" role="status">
              Pick a section of <strong>{pickCourse.code}</strong> ({preview.length} other{preview.length === 1 ? '' : 's'}) — click the current one for details, or press Esc.
              <button className="link" onClick={() => setPickCourseId(null)}>Done</button>
            </div>
          )}
        />
      </main>

      {detail && (
        <DetailsPanel
          section={detail}
          inSchedule={sectionIds.includes(detail.id)}
          conflicts={scheduled.filter((s) => s.id !== detail.id)}
          canAdd={!!scheduleId}
          onToggle={() => (sectionIds.includes(detail.id) ? removeSectionById(detail.id) : addSectionById(detail.id))}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  )
}
