import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seed ma\'lumotlar kiritilmoqda...')

  // ─── Users ───────────────────────────────────────────────────────────────────

  const superAdmin = await prisma.user.upsert({
    where:  { email: 'superadmin@seasmp.uz' },
    update: {},
    create: {
      email:        'superadmin@seasmp.uz',
      passwordHash: await bcrypt.hash('Admin@1234', 12),
      firstName:    'Super',
      lastName:     'Admin',
      role:         'SUPER_ADMIN',
    },
  })

  const admin = await prisma.user.upsert({
    where:  { email: 'admin@seasmp.uz' },
    update: {},
    create: {
      email:        'admin@seasmp.uz',
      passwordHash: await bcrypt.hash('Admin@1234', 12),
      firstName:    'Aziz',
      lastName:     'Karimov',
      role:         'ADMIN',
    },
  })

  const teacher1 = await prisma.user.upsert({
    where:  { email: 'teacher1@seasmp.uz' },
    update: {},
    create: {
      email:        'teacher1@seasmp.uz',
      passwordHash: await bcrypt.hash('Teacher@1234', 12),
      firstName:    'Jasur',
      lastName:     'Toshmatov',
      role:         'TEACHER',
    },
  })

  const teacher2 = await prisma.user.upsert({
    where:  { email: 'teacher2@seasmp.uz' },
    update: {},
    create: {
      email:        'teacher2@seasmp.uz',
      passwordHash: await bcrypt.hash('Teacher@1234', 12),
      firstName:    'Nilufar',
      lastName:     'Rashidova',
      role:         'TEACHER',
    },
  })

  const students = await Promise.all([
    { email: 'student1@seasmp.uz', firstName: 'Bobur',   lastName: 'Yusupov'   },
    { email: 'student2@seasmp.uz', firstName: 'Malika',  lastName: 'Ergasheva' },
    { email: 'student3@seasmp.uz', firstName: 'Sherzod', lastName: 'Nazarov'   },
    { email: 'student4@seasmp.uz', firstName: 'Zulfiya', lastName: 'Mirzaeva'  },
    { email: 'student5@seasmp.uz', firstName: 'Hamza',   lastName: 'Abdullayev'},
  ].map(s =>
    prisma.user.upsert({
      where:  { email: s.email },
      update: {},
      create: {
        email:        s.email,
        passwordHash: bcrypt.hashSync('Student@1234', 12),
        firstName:    s.firstName,
        lastName:     s.lastName,
        role:         'STUDENT',
      },
    })
  ))

  console.log(`✅ Foydalanuvchilar: ${2 + 2 + students.length} ta`)

  // ─── Courses ─────────────────────────────────────────────────────────────────

  const course1 = await prisma.course.upsert({
    where:  { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id:            '00000000-0000-0000-0000-000000000001',
      title:         'Web dasturlash asoslari',
      description:   'HTML, CSS va JavaScript orqali web-saytlar yaratish',
      teacherId:     teacher1.id,
      category:      'Dasturlash',
      price:         500000,
      durationWeeks: 12,
      maxStudents:   20,
      status:        'ACTIVE',
      schedule:      { days: ['Monday', 'Wednesday', 'Friday'], time: '10:00', room: 'A-1' },
    },
  })

  const course2 = await prisma.course.upsert({
    where:  { id: '00000000-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id:            '00000000-0000-0000-0000-000000000002',
      title:         'Ma\'lumotlar bazasi',
      description:   'SQL va NoSQL ma\'lumotlar bazalari bilan ishlash',
      teacherId:     teacher1.id,
      category:      'Dasturlash',
      price:         450000,
      durationWeeks: 10,
      maxStudents:   25,
      status:        'ACTIVE',
      schedule:      { days: ['Tuesday', 'Thursday'], time: '14:00', room: 'B-2' },
    },
  })

  const course3 = await prisma.course.upsert({
    where:  { id: '00000000-0000-0000-0000-000000000003' },
    update: {},
    create: {
      id:            '00000000-0000-0000-0000-000000000003',
      title:         'Ingliz tili (A2-B1)',
      description:   'Kundalik muloqot va biznes ingliz tili',
      teacherId:     teacher2.id,
      category:      'Til kurslari',
      price:         350000,
      durationWeeks: 16,
      maxStudents:   15,
      status:        'ACTIVE',
      schedule:      { days: ['Monday', 'Wednesday'], time: '16:00', room: 'C-3' },
    },
  })

  console.log('✅ Kurslar: 3 ta')

  // ─── Enrollments ─────────────────────────────────────────────────────────────

  for (const student of students.slice(0, 3)) {
    await prisma.enrollment.upsert({
      where:  { studentId_courseId: { studentId: student.id, courseId: course1.id } },
      update: {},
      create: { studentId: student.id, courseId: course1.id },
    })
  }

  for (const student of students.slice(1, 4)) {
    await prisma.enrollment.upsert({
      where:  { studentId_courseId: { studentId: student.id, courseId: course2.id } },
      update: {},
      create: { studentId: student.id, courseId: course2.id },
    })
  }

  for (const student of students.slice(2, 5)) {
    await prisma.enrollment.upsert({
      where:  { studentId_courseId: { studentId: student.id, courseId: course3.id } },
      update: {},
      create: { studentId: student.id, courseId: course3.id },
    })
  }

  console.log('✅ Yozilishlar: 9 ta')

  // ─── Assessments ─────────────────────────────────────────────────────────────

  await prisma.assessment.upsert({
    where:  { id: '00000000-0000-0000-0000-000000000011' },
    update: {},
    create: {
      id:       '00000000-0000-0000-0000-000000000011',
      courseId: course1.id,
      title:    '1-oraliq nazorat',
      type:     'MIDTERM',
      maxScore: 100,
      weight:   0.3,
    },
  })

  await prisma.assessment.upsert({
    where:  { id: '00000000-0000-0000-0000-000000000012' },
    update: {},
    create: {
      id:       '00000000-0000-0000-0000-000000000012',
      courseId: course1.id,
      title:    'Yakuniy imtihon',
      type:     'FINAL',
      maxScore: 100,
      weight:   0.5,
    },
  })

  console.log('✅ Baholashlar: 2 ta')

  console.log('\n🎉 Seed muvaffaqiyatli yakunlandi!')
  console.log('\n📋 Login ma\'lumotlari:')
  console.log('  Super Admin : superadmin@seasmp.uz / Admin@1234')
  console.log('  Admin       : admin@seasmp.uz      / Admin@1234')
  console.log("  O'qituvchi  : teacher1@seasmp.uz   / Teacher@1234")
  console.log('  Talaba      : student1@seasmp.uz   / Student@1234')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
