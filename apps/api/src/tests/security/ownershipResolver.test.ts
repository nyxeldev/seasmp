/**
 * Egalik hal qiluvchisining sof mantiqi — 1-qatlamning yadrosi.
 * Bazasiz ishlaydi: yo'lni include daraxtiga aylantirish va munosabatni aniqlash.
 */
import { buildInclude, mergeIncludes, readPath } from '../../services/ownershipPaths'

describe('buildInclude — nuqtali yo\'lni Prisma include daraxtiga aylantirish', () => {
  it('bitta segment uchun include kerak emas', () => {
    expect(buildInclude('teacherId')).toBeUndefined()
  })

  it('bitta bog\'lanish', () => {
    expect(buildInclude('course.teacherId')).toEqual({ course: true })
  })

  it('ichma-ich bog\'lanish', () => {
    expect(buildInclude('enrollment.course.teacherId')).toEqual({
      enrollment: { include: { course: true } },
    })
  })
})

describe('mergeIncludes — bir resursning bir nechta qoidasi birlashtiriladi', () => {
  it('grades: OWNER va CUSTODIAN yo\'llari bitta daraxtga', () => {
    const merged = mergeIncludes([
      buildInclude('enrollment.studentId'),
      buildInclude('enrollment.course.teacherId'),
    ])
    expect(merged).toEqual({ enrollment: { include: { course: true } } })
  })

  it('enrollments: sayoz va chuqur yo\'l aralashmasi', () => {
    const merged = mergeIncludes([buildInclude('studentId'), buildInclude('course.teacherId')])
    expect(merged).toEqual({ course: true })
  })

  it('bo\'sh ro\'yxat undefined qaytaradi', () => {
    expect(mergeIncludes([undefined, undefined])).toBeUndefined()
  })
})

describe('readPath — qiymatni nuqtali yo\'l bo\'yicha o\'qish', () => {
  const grade = { enrollment: { studentId: 'S1', course: { teacherId: 'T1' } } }

  it('egasini topadi', () => {
    expect(readPath(grade, 'enrollment.studentId')).toBe('S1')
  })

  it('javobgarni topadi', () => {
    expect(readPath(grade, 'enrollment.course.teacherId')).toBe('T1')
  })

  it('mavjud bo\'lmagan yo\'l uchun null', () => {
    expect(readPath(grade, 'enrollment.course.missing')).toBeNull()
  })

  it('oraliqda null bo\'lsa yiqilmaydi', () => {
    expect(readPath({ enrollment: null }, 'enrollment.course.teacherId')).toBeNull()
  })

  it('string bo\'lmagan qiymat uchun null', () => {
    expect(readPath({ a: 42 }, 'a')).toBeNull()
  })
})
