import { describe, expect, it } from 'vitest'
import { indexLabs, isLabCourse } from './labs'
import type { Course } from './types'

let nextId = 1
function course(code: string, type = 'LEC'): Course {
  const id = nextId++
  return {
    id, term_id: '2027SP', code, title: code, department: null, credits: 1, description: null, cross_listed: [], catalog_url: null,
    sections: [{ id: id * 100, course_id: id, section: '01', instructors: [], days: 'M', start_time: '13:00', end_time: '16:00',
      building: null, room: null, capacity: null, status: 'open', comments: null, types: [],
      meetings: [{ days: 'M', start_time: '13:00', end_time: '16:00', type }] }],
  }
}

describe('labs', () => {
  const chem = course('CHEM 190')
  const chemLab = course('CHEM 190L', 'LAB')
  const bioB = course('BIO 100B')
  const bioP = course('BIO 100P')
  const bioLab = course('BIO 100L', 'LAB')
  const orphan = course('GEOSC 999L', 'LAB')
  const notALab = course('MATH 116L') // ends in L but has no lab meetings
  const all = [chem, chemLab, bioB, bioP, bioLab, orphan, notALab]
  const { labsOf, classesOf } = indexLabs(all)

  it('recognizes lab courses by code and meeting type', () => {
    expect(isLabCourse(chemLab)).toBe(true)
    expect(isLabCourse(chem)).toBe(false)
    expect(isLabCourse(notALab)).toBe(false)
  })
  it('pairs a lab with the class of the same code', () => {
    expect(labsOf.get(chem.id)).toEqual([chemLab])
    expect(classesOf.get(chemLab.id)).toEqual([chem])
  })
  it('shares one lab among a lettered family of classes', () => {
    expect(classesOf.get(bioLab.id)).toEqual([bioB, bioP])
    expect(labsOf.get(bioB.id)).toEqual([bioLab])
    expect(labsOf.get(bioP.id)).toEqual([bioLab])
  })
  it('leaves a lab without a class on its own', () => {
    expect(classesOf.has(orphan.id)).toBe(false)
  })
})
