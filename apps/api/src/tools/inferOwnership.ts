/**
 * Bosqich B — egalik munosabatlarini trafikdan avtomatik chiqarish, CLI.
 *
 * Har bir resurs turi uchun: Prisma sxemasidan nomzod yo'llarni topadi,
 * audit_logs dagi haqiqiy trafikdan ularning ishonchini o'lchaydi va
 * mavjud (qo'lda yozilgan) qoidalar bilan solishtiradi.
 *
 * Bu — ishning asosiy ichki tekshiruvi: agar algoritm ODAM YOZGAN qoidani
 * (masalan "grades uchun enrollment.studentId = OWNER") mustaqil ravishda,
 * faqat trafikdan qayta kashf etsa, bu avtomatik chiqarishning ishonchli
 * ekanini ko'rsatadi — E1/E2 dagi kabi mustaqil tekshiruv, lekin ichki.
 *
 * Ishlatish:
 *   npm run infer:ownership --workspace=apps/api
 *   npm run infer:ownership --workspace=apps/api -- --write   (chegaradan
 *     o'tgan takliflarni bazaga INFERRED+active=false bilan yozadi)
 *   npm run infer:ownership --workspace=apps/api -- --json
 */
import { prisma } from '../config/prisma'
import { scoreAllResourceTypes, writeProposal } from '../services/ownershipInference'

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const asJson = args.includes('--json')
  const doWrite = args.includes('--write')
  const log = (...a: unknown[]) => { if (!asJson) console.log(...a) }

  log('\nBosqich B — EGALIK MUNOSABATLARINI AVTOMATIK CHIQARISH\n')
  log('Nomzod yo\'llar faqat Prisma sxemasidan topiladi (resurs turiga xos\n' +
      'hech narsa yozilmagan), ishonch esa audit_logs dagi haqiqiy\n' +
      'trafikdan hisoblanadi.\n')

  const results = await scoreAllResourceTypes()

  let totalProposals = 0
  let totalMatchedManual = 0
  let totalMismatchedManual = 0

  for (const r of results) {
    log(`${'─'.repeat(78)}`)
    log(`${r.resourceType}  (model: ${r.modelName})`)
    log(`${'─'.repeat(78)}`)

    const sorted = [...r.candidates].sort((a, b) => (b.bestRole?.confidence ?? 0) - (a.bestRole?.confidence ?? 0))
    log('  Nomzod yo\'llar (eng yaxshi rol bo\'yicha; umumiy ishonch qavsda):')
    for (const c of sorted) {
      const existingRule = r.existingRules.find((e) => e.ownerPath === c.path)
      const tag = existingRule ? ` [MAVJUD: ${existingRule.role}/${existingRule.source}]` : ''
      const best = c.bestRole
        ? `${c.bestRole.role}: ishonch=${c.bestRole.confidence.toFixed(3)} (${c.bestRole.matches}/${c.bestRole.total})`
        : 'yetarli tayanch yo\'q'
      log(`    ${c.path.padEnd(32)} ${best}  [umumiy=${c.confidence.toFixed(3)}, ${c.matches}/${c.total}]${tag}`)
    }

    // Ichki tekshiruv: mavjud MANUAL qoidalar algoritm nazarida qanday ko'rinadi?
    // ENG YAXSHI rol bo'yicha solishtiriladi — umumiy ishonch chalg'itadi
    // (bir xil rol-shartlangan mantiq uchun CandidateScore.byRole izohiga qarang).
    for (const rule of r.existingRules) {
      if (rule.source !== 'MANUAL') continue
      const c = r.candidates.find((x) => x.path === rule.ownerPath)
      if (!c?.bestRole) {
        log(`  ? MANUAL qoida (${rule.ownerPath}) — hali yetarli trafik yo'q, tekshirib bo'lmadi`)
        continue
      }
      const threshold = rule.role === 'OWNER' ? 0.8 : 0.6
      if (c.bestRole.confidence >= threshold) {
        totalMatchedManual++
        log(`  ✓ MANUAL qoida (${rule.ownerPath}) algoritm tomonidan ham tasdiqlandi (${rule.role}, eng mos rol=${c.bestRole.role}, ishonch=${c.bestRole.confidence.toFixed(3)})`)
      } else {
        totalMismatchedManual++
        log(`  ✗ MANUAL qoida (${rule.ownerPath}) algoritm ishonchi past (eng yaxshisi ${c.bestRole.role}=${c.bestRole.confidence.toFixed(3)} < ${threshold}) — tayanch=${c.bestRole.total}`)
      }
    }

    if (r.proposals.length > 0) {
      log('  YANGI TAKLIF (mavjud qoidada yo\'q edi):')
      for (const p of r.proposals) {
        log(`    ${p.ownerPath} = ${p.role}  (${p.actorRole} roli uchun)  ishonch=${p.confidence.toFixed(3)}  tayanch=${p.supportCount}`)
        totalProposals++
        if (doWrite) {
          const ok = await writeProposal(r.resourceType, p.ownerPath, p.role, p.confidence, p.supportCount)
          log(`      -> ${ok ? 'yozildi (INFERRED, active=false)' : 'yozilmadi (xato yoki allaqachon mavjud)'}`)
        }
      }
    }
    log('')
  }

  log(`${'='.repeat(78)}`)
  log('XULOSA')
  log(`${'='.repeat(78)}`)
  log(`  Mavjud MANUAL qoidalardan algoritm tasdiqlagani: ${totalMatchedManual}`)
  log(`  Mavjud MANUAL qoidalardan algoritm tasdiqlamagani: ${totalMismatchedManual}`)
  log(`  Yangi taklif (ilgari qoida bo'lmagan joyda): ${totalProposals}`)
  if (!doWrite && totalProposals > 0) {
    log(`  (bazaga yozish uchun --write bilan qayta ishga tushiring)`)
  }

  if (asJson) {
    console.log(JSON.stringify({
      results, totalMatchedManual, totalMismatchedManual, totalProposals,
      generatedAt: new Date().toISOString(),
    }, null, 2))
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(async () => { await prisma.$disconnect() })
