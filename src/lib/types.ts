export type SectionStatus = 'open' | 'waitlisted' | 'closed' | 'canceled'

export interface Term {
  id: string
  name: string
  is_active: boolean
  start_date: string // YYYY-MM-DD
  end_date: string
  no_class_dates: string[]
}

/** One meeting pattern of a section (a section can have a lecture and a lab, or run part of the term). */
export interface Meeting {
  days: string // e.g. "MW"
  start_time: string // "HH:MM" or "HH:MM:SS"
  end_time: string
  building?: string | null
  room?: string | null
  type?: string | null // LEC, LAB, …
  start_date?: string | null // YYYY-MM-DD; defaults to the term's dates
  end_date?: string | null
}

export interface Section {
  id: number
  course_id: number
  section: string
  instructors: string[]
  days: string | null // e.g. "MWF", "TR"; null/"" = TBA
  start_time: string | null // "HH:MM:SS"
  end_time: string | null
  building: string | null
  room: string | null
  capacity: number | null
  status: SectionStatus
  meetings: Meeting[]
  comments: string | null
  /** Self-Service course types for this section, e.g. "Writing Intensive Courses", "First Year Courses".
   *  Use these for search filters (see README: "Adding a search filter"). */
  types: string[]
}

export interface Course {
  id: number
  term_id: string
  code: string
  title: string
  department: string | null
  credits: number | null
  description: string | null
  cross_listed: string[]
  catalog_url: string | null
  /** From the course's catalogue page, e.g. "CHEM 120"; null if none listed (or not scraped yet). */
  prerequisites?: string | null
  corequisites?: string | null
  sections: Section[]
}

/** A section together with its course, which is what the UI usually needs. */
export interface SectionWithCourse extends Section {
  course: Course
}

export interface Schedule {
  id: number
  user_id: string
  term_id: string
  name: string
  created_at: string
}

export const MAX_SCHEDULES_PER_TERM = 3
