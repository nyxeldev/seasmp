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
