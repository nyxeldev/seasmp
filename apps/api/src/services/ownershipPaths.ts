/**
 * Egalik yo'llarining sof mantiqi — bazaga bog'liq emas.
 * Alohida modulda, chunki bu qism testlarda Prisma'siz sinaladi.
 */

/** "enrollment.course.teacherId" -> { enrollment: { include: { course: true } } } */
export function buildInclude(path: string): any | undefined {
  const parts = path.split('.')
  if (parts.length < 2) return undefined
  const rels = parts.slice(0, -1)
  let inc: any = { [rels[rels.length - 1]]: true }
  for (let i = rels.length - 2; i >= 0; i--) inc = { [rels[i]]: { include: inc } }
  return inc
}

/** Bir resursning bir nechta qoidasidan kelgan include daraxtlarini birlashtiradi */
export function mergeIncludes(trees: any[]): any | undefined {
  const out: any = {}
  for (const t of trees) {
    if (!t) continue
    for (const k of Object.keys(t)) {
      const v = t[k]
      if (out[k] === undefined) { out[k] = v; continue }
      if (out[k] === true) { out[k] = v; continue }
      if (v === true) continue
      out[k] = { include: mergeIncludes([out[k].include, v.include]) }
    }
  }
  return Object.keys(out).length ? out : undefined
}

/** Nuqtali yo'l bo'yicha qiymatni o'qiydi; oraliqda null bo'lsa yiqilmaydi */
export function readPath(row: any, path: string): string | null {
  let cur = row
  for (const seg of path.split('.')) {
    if (cur == null) return null
    cur = cur[seg]
  }
  return typeof cur === 'string' ? cur : null
}

// ── Bosqich B: ishonch hisob-kitobi — sof mantiq, bazaga bog'liq emas ───────

export interface RoleScore {
  role: string
  matches: number
  total: number
  confidence: number
}

export interface CandidateScore {
  path: string
  segments: number
  matches: number
  total: number
  confidence: number
  byRole: RoleScore[]
  bestRole: RoleScore | null
}

export interface ScoreEvent {
  resourceId: string
  userId: string | null
  role: string | null
}

/**
 * Hodisalar (audit_logs dan) va resurs qatorlari (bazadan allaqachon
 * olingan) asosida har bir nomzod yo'l uchun umumiy va rol bo'yicha
 * ishonchni hisoblaydi.
 *
 * Ataylab bazaga bog'liq emas: `scoreResourceType` ma'lumotni olib keladi,
 * bu funksiya faqat hisoblaydi — shu sababli Prisma'siz, to'liq sintetik
 * ma'lumot bilan test qilinadi.
 */
export function aggregateCandidateScores(
  candidates: { path: string; segments: number }[],
  events: ScoreEvent[],
  rowById: Map<string, any>,
  minRoleSupport: number,
): CandidateScore[] {
  const overall = new Map<string, { matches: number; total: number }>()
  const perRole = new Map<string, Map<string, { matches: number; total: number }>>()
  for (const c of candidates) {
    overall.set(c.path, { matches: 0, total: 0 })
    perRole.set(c.path, new Map())
  }

  for (const ev of events) {
    if (!ev.userId || !ev.role) continue
    const row = rowById.get(ev.resourceId)
    if (!row) continue
    for (const c of candidates) {
      const hit = readPath(row, c.path) === ev.userId

      const o = overall.get(c.path)!
      o.total++
      if (hit) o.matches++

      const byRole = perRole.get(c.path)!
      const r = byRole.get(ev.role) ?? { matches: 0, total: 0 }
      r.total++
      if (hit) r.matches++
      byRole.set(ev.role, r)
    }
  }

  return candidates.map((c) => {
    const o = overall.get(c.path)!
    const byRole: RoleScore[] = [...perRole.get(c.path)!.entries()]
      .map(([role, s]) => ({ role, matches: s.matches, total: s.total, confidence: s.total > 0 ? s.matches / s.total : 0 }))
      .sort((a, b) => b.confidence - a.confidence)
    const bestRole = byRole.find((r) => r.total >= minRoleSupport) ?? null
    return {
      ...c, matches: o.matches, total: o.total, confidence: o.total > 0 ? o.matches / o.total : 0,
      byRole, bestRole,
    }
  })
}
