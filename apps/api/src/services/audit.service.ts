import { prisma } from '../config/prisma'
import type { AuditAction } from '@prisma/client'

interface AuditParams {
  userId:     string | null
  action:     AuditAction
  resource:   string
  resourceId?: string
  oldData?:   object
  newData?:   object
  ipAddress:  string
  userAgent?: string
}

export const auditService = {
  async log(params: AuditParams): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId:     params.userId,
          action:     params.action,
          resource:   params.resource,
          resourceId: params.resourceId,
          oldData:    params.oldData as any,
          newData:    params.newData as any,
          ipAddress:  params.ipAddress,
          userAgent:  params.userAgent,
        },
      })
    } catch (err) {
      // Audit log xatosi tizimni to'xtatmasin
      console.error('Audit log yozishda xato:', err)
    }
  },
}
