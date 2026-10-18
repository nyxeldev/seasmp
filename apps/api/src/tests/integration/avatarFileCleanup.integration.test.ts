/**
 * L2 — replacing an avatar must delete the OLD file from disk, but only
 * after the new file is safely stored and the DB reference is updated —
 * never before, and never on a failed replacement (the user must not end
 * up with no avatar because cleanup ran ahead of persistence).
 */
import { startApp, seedStudent, cleanup, makeToken, prisma } from './setup'
import { avatarStaticRoot } from '../../services/avatarStorage.service'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let studentId: string
const filesToCleanup: string[] = []

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function multipartAvatarPayload(buf: Buffer, filename = 'avatar.png', contentType = 'image/png') {
  const boundary = '----avatarCleanupBoundary123'
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
    ),
    buf,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
  return { body, contentType: `multipart/form-data; boundary=${boundary}` }
}

async function uploadAvatar(token: string, buf: Buffer) {
  const { body, contentType } = multipartAvatarPayload(buf)
  return app.inject({
    method: 'POST',
    url: '/v1/users/me/avatar',
    headers: { authorization: `Bearer ${token}`, 'content-type': contentType },
    payload: body,
  })
}

function filenameOf(avatarUrl: string) {
  return avatarUrl.split('/').pop()!
}

async function fileExists(filename: string) {
  try {
    await fs.access(path.join(avatarStaticRoot(), filename))
    return true
  } catch {
    return false
  }
}

beforeAll(async () => {
  app = await startApp()
  const student = await seedStudent()
  studentId = student.id
})

afterAll(async () => {
  for (const filename of filesToCleanup) {
    await fs.unlink(path.join(avatarStaticRoot(), filename)).catch(() => {})
  }
  await cleanup(studentId)
  await app.close()
})

describe('L2 — avatar file lifecycle on replacement', () => {
  it('first upload: no previous avatar, new file is stored and kept', async () => {
    const token = makeToken(studentId, 'STUDENT')
    const res = await uploadAvatar(token, Buffer.concat([PNG_SIGNATURE, Buffer.from('first')]))
    expect(res.statusCode).toBe(200)

    const avatarUrl = res.json().data.avatarUrl as string
    const filename = filenameOf(avatarUrl)
    filesToCleanup.push(filename)
    expect(await fileExists(filename)).toBe(true)
  })

  it('replacement: old file is deleted, new file remains, DB points to the new one', async () => {
    const token = makeToken(studentId, 'STUDENT')
    const before = await prisma.user.findUnique({ where: { id: studentId } })
    const oldFilename = filenameOf(before!.avatarUrl!)
    expect(await fileExists(oldFilename)).toBe(true)

    const res = await uploadAvatar(token, Buffer.concat([PNG_SIGNATURE, Buffer.from('second')]))
    expect(res.statusCode).toBe(200)
    const newAvatarUrl = res.json().data.avatarUrl as string
    const newFilename = filenameOf(newAvatarUrl)
    filesToCleanup.push(newFilename)

    expect(newFilename).not.toBe(oldFilename)
    expect(await fileExists(newFilename)).toBe(true)
    // Old file must be gone now that the replacement succeeded.
    expect(await fileExists(oldFilename)).toBe(false)

    const after = await prisma.user.findUnique({ where: { id: studentId } })
    expect(after?.avatarUrl).toBe(newAvatarUrl)
  })

  it('a failed replacement (invalid file) does not delete the current valid avatar', async () => {
    const token = makeToken(studentId, 'STUDENT')
    const before = await prisma.user.findUnique({ where: { id: studentId } })
    const currentFilename = filenameOf(before!.avatarUrl!)
    expect(await fileExists(currentFilename)).toBe(true)

    // Garbage bytes — fails detectImageType, saveAvatar throws
    // InvalidAvatarError BEFORE any DB update or old-file deletion runs.
    const res = await uploadAvatar(token, Buffer.from('not-an-image-at-all'))
    expect(res.statusCode).toBe(400)

    const after = await prisma.user.findUnique({ where: { id: studentId } })
    expect(after?.avatarUrl).toBe(before?.avatarUrl)
    expect(await fileExists(currentFilename)).toBe(true)
  })

  it('a missing old file on disk is handled safely (replacement still succeeds)', async () => {
    const before = await prisma.user.findUnique({ where: { id: studentId } })
    const missingFilename = filenameOf(before!.avatarUrl!)
    // Simulate the old file having already been lost (e.g. manual
    // cleanup, volume issue) without updating the DB reference.
    await fs.unlink(path.join(avatarStaticRoot(), missingFilename))

    const token = makeToken(studentId, 'STUDENT')
    const res = await uploadAvatar(token, Buffer.concat([PNG_SIGNATURE, Buffer.from('third')]))
    expect(res.statusCode).toBe(200)

    const newAvatarUrl = res.json().data.avatarUrl as string
    filesToCleanup.push(filenameOf(newAvatarUrl))
    expect(await fileExists(filenameOf(newAvatarUrl))).toBe(true)
  })
})
