import { supabase } from './supabase'
import type { Course, Schedule, Term } from './types'

const PAGE = 1000 // the Data API returns at most 1000 rows per request

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

/** Turn database errors into messages a student can act on. */
export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (msg.includes('schedules_user_term_name_key')) return 'You already have a schedule with that name this semester.'
  if (msg.includes('schedules_name_check')) return 'Schedule names must be 1–40 characters.'
  return msg
}

export async function fetchTerms(): Promise<Term[]> {
  return check(await supabase.from('terms').select('*').order('start_date', { ascending: true }))
}

/** All courses (with their sections) for a term, fetched in pages. */
export async function fetchCatalog(termId: string): Promise<Course[]> {
  const all: Course[] = []
  for (let from = 0; ; from += PAGE) {
    const rows = check(
      await supabase
        .from('courses')
        .select('*, sections(*)')
        .eq('term_id', termId)
        .order('code')
        .order('id')
        .range(from, from + PAGE - 1),
    ) as Course[]
    all.push(...rows)
    if (rows.length < PAGE) break
  }
  for (const c of all) c.sections.sort((a, b) => a.section.localeCompare(b.section, undefined, { numeric: true }))
  return all
}

/** Make sure the student has "My Schedule" in every active term (e.g. after a new term opens). */
export async function ensureDefaultSchedules(): Promise<void> {
  check(await supabase.rpc('ensure_default_schedules'))
}

export async function fetchSchedules(termId: string): Promise<Schedule[]> {
  return check(await supabase.from('schedules').select('*').eq('term_id', termId).order('created_at').order('id'))
}

export async function createSchedule(termId: string, name: string): Promise<Schedule> {
  return check(await supabase.from('schedules').insert({ term_id: termId, name: name.trim() }).select().single())
}

export async function renameSchedule(id: number, name: string): Promise<void> {
  check(await supabase.from('schedules').update({ name: name.trim() }).eq('id', id))
}

export async function deleteSchedule(id: number): Promise<void> {
  check(await supabase.from('schedules').delete().eq('id', id))
}

export async function fetchScheduleSectionIds(scheduleId: number): Promise<number[]> {
  const rows = check(await supabase.from('schedule_sections').select('section_id').eq('schedule_id', scheduleId)) as { section_id: number }[]
  return rows.map((r) => r.section_id)
}

export async function addSection(scheduleId: number, sectionId: number): Promise<void> {
  check(await supabase.from('schedule_sections').insert({ schedule_id: scheduleId, section_id: sectionId }))
}

/** Remove several sections from a schedule in one request (e.g. a lecture and its lab). */
export async function removeSections(scheduleId: number, sectionIds: number[]): Promise<void> {
  if (sectionIds.length === 0) return
  check(await supabase.from('schedule_sections').delete().eq('schedule_id', scheduleId).in('section_id', sectionIds))
}
