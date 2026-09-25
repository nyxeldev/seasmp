import { prisma } from '../config/prisma'
import type { AuditAction, AccessRelation } from '@prisma/client'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** resource_id va resource_owner_id ustunlari UUID tipida —
 *  UUID bo'lmagan qiymat bazani xato beradi, shuning uchun filtrlanadi. */
function asUuid(v: string | null | undefined): string | undefined {
  return v && UUID_RE.test(v) ? v : undefined
}

export interface AuditParams {
  userId:           string | null
  action:           AuditAction
  resource:         string
  resourceId?:      string | null
  /** Murojaat qilingan obyekt kimga tegishli. 1-qatlam (avtorizatsiya) shunga tayanadi. */
  resourceOwnerId?: string | null
  /** Aktor va obyekt o'rtasidagi munosabat — 1-qatlamning asosiy natijasi. */
  accessRelation?:  AccessRelation | null
  oldData?:         object
  newData?:         object
  ipAddress:        string
  userAgent?:       string
  httpMethod?:      string
  path?:            string
  statusCode?:      number
  durationMs?:      number
}

function toRow(p: AuditParams) {
  return {
    userId:          p.userId,
    action:          p.action,
    resource:        p.resource,
    resourceId:      asUuid(p.resourceId),
    resourceOwnerId: asUuid(p.resourceOwnerId),
    accessRelation:  p.accessRelation ?? undefined,
    oldData:         p.oldData as any,
    newData:         p.newData as any,
    ipAddress:       p.ipAddress,
    userAgent:       p.userAgent,
    httpMethod:      p.httpMethod ? p.httpMethod.slice(0, 10) : undefined,
    path:            p.path ? p.path.slice(0, 255) : undefined,
    statusCode:      p.statusCode,
    durationMs:      p.durationMs,
  }
}

export const auditService = {
  async log(params: AuditParams): Promise<void> {
    try {
      await prisma.auditLog.create({ data: toRow(params) })
    } catch (err) {
      // Audit log xatosi tizimni to'xtatmasin
      console.error('Audit log yozishda xato:', err)
    }
  },

  /** Ko'p yozuvni bir marta yozish — eksperiment ma'lumotlarini yuklashda ishlatiladi. */
  async logMany(rows: AuditParams[]): Promise<void> {
    if (rows.length === 0) return
    try {
      await prisma.auditLog.createMany({ data: rows.map(toRow) })
    } catch (err) {
      console.error('Audit log (ommaviy) yozishda xato:', err)
    }
  },
}
