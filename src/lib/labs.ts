import type { Course } from './types'

/**
 * Labs are separate courses in Self-Service (CHEM 190L next to CHEM 190). A lab belongs to the
 * class with the same code minus the "L" — or, when that's a family of lettered classes
 * (BIO 100B, BIO 100P… share BIO 100L), to every class in the family.
 */
export function isLabCourse(c: Pick<Course, 'code' | 'sections'>): boolean {
  return /\d[A-Z]?L$/.test(c.code) && c.sections.some((s) => s.meetings.some((m) => m.type === 'LAB'))
}

export interface LabIndex {
  /** Class course id -> its lab courses. */
  labsOf: Map<number, Course[]>
  /** Lab course id -> the classes it belongs to (only labs that have one). */
  classesOf: Map<number, Course[]>
}

export function indexLabs(courses: Course[]): LabIndex {
  const labsOf = new Map<number, Course[]>()
  const classesOf = new Map<number, Course[]>()
  const byCode = new Map(courses.map((c) => [c.code, c]))
  for (const lab of courses) {
    if (!isLabCourse(lab)) continue
    const base = lab.code.slice(0, -1)
    const exact = byCode.get(base)
    const family = exact ? [exact] : courses.filter((c) => c !== lab && c.code.length === base.length + 1 && c.code.startsWith(base) && /[A-Z]$/.test(c.code) && !isLabCourse(c))
    if (!family.length) continue
    classesOf.set(lab.id, family)
    for (const c of family) labsOf.set(c.id, [...(labsOf.get(c.id) ?? []), lab])
  }
  return { labsOf, classesOf }
}
