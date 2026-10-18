/**
 * M2 — PATCH /v1/users/me must not allow an arbitrary, client-supplied
 * `avatarUrl`. The only trusted path to set it is POST /v1/users/me/avatar
 * (byte-signature-checked upload, server-generated filename).
 */
import { startApp, seedStudent, cleanup, makeToken, prisma } from './setup'
import { avatarStaticRoot } from '../../services/avatarStorage.service'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let studentId: string
const uploadedAvatarPaths: string[] = []

// Minimal buffer that satisfies detectImageType's PNG signature check
// (imageSignature.ts only inspects the first 8 magic bytes, not full
// image validity) — enough to exercise the real saveAvatar() code path.
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const FAKE_PNG = Buffer.concat([PNG_SIGNATURE, Buffer.from('test-avatar-bytes')])

function multipartAvatarPayload(buf: Buffer, filename = 'avatar.png', contentType = 'image/png') {
  const boundary = '----avatarTestBoundary123'
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
    ),
    buf,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
  return { body, contentType: `multipart/form-data; boundary=${boundary}` }
}

beforeAll(async () => {
  app = await startApp()
  const student = await seedStudent()
  studentId = student.id
})

afterAll(async () => {
  for (const relativeUrl of uploadedAvatarPaths) {
    const filename = relativeUrl.split('/').pop()!
    await fs.unlink(path.join(avatarStaticRoot(), filename)).catch(() => {})
  }
  await cleanup(studentId)
  await app.close()
})

describe('M2 — PATCH /v1/users/me rejects client-supplied avatarUrl', () => {
  it('an ordinary profile update (firstName/lastName) still works', async () => {
    const token = makeToken(studentId, 'STUDENT')
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/users/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { firstName: 'Updated', lastName: 'Name' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.firstName).toBe('Updated')
  })

  it('an arbitrary external avatarUrl is rejected (400), avatar is left unchanged', async () => {
    const before = await prisma.user.findUnique({ where: { id: studentId } })
    const token = makeToken(studentId, 'STUDENT')
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/users/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { firstName: 'Attacker', avatarUrl: 'https://attacker.example/tracker.png' },
    })
    expect(res.statusCode).toBe(400)

    const after = await prisma.user.findUnique({ where: { id: studentId } })
    expect(after?.avatarUrl).toBe(before?.avatarUrl)
    // The whole request must be rejected — firstName must not be applied
    // either (no partial application of a request that smuggled avatarUrl).
    expect(after?.firstName).not.toBe('Attacker')
  })

  it('a malformed/untrusted avatar value (not even a URL) is also rejected', async () => {
    const token = makeToken(studentId, 'STUDENT')
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/users/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { avatarUrl: 'javascript:alert(1)' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('the legitimate upload flow (POST /me/avatar) still sets a real, server-generated avatarUrl', async () => {
    const token = makeToken(studentId, 'STUDENT')
    const { body, contentType } = multipartAvatarPayload(FAKE_PNG)
    const res = await app.inject({
      method: 'POST',
      url: '/v1/users/me/avatar',
      headers: { authorization: `Bearer ${token}`, 'content-type': contentType },
      payload: body,
    })
    expect(res.statusCode).toBe(200)
    const avatarUrl = res.json().data.avatarUrl as string
    expect(avatarUrl).toMatch(/^\/v1\/uploads\/avatars\/[0-9a-f-]+\.png$/)
    uploadedAvatarPaths.push(avatarUrl)
  })
})
