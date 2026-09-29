/**
 * Sarlavhadan URL uchun yaroqli slug yasaydi.
 *
 * O'zbek lotin alifbosi ASCII ga yaqin, lekin bir nechta tuzoq bor:
 *   - `o'` va `g'` dagi apostrof turli belgilar bilan yoziladi (', ’, ʻ, ‘)
 *     va ularning hammasi olib tashlanishi kerak: "o'quv" -> "oquv"
 *   - qavslar, nuqta-vergul va bo'shliqlar chiziqchaga aylanadi
 *   - kirill yozuvi ham uchraydi, shuning uchun transliteratsiya jadvali bor
 *
 * Natija faqat [a-z0-9-] dan iborat bo'ladi.
 */

/** Kirill -> lotin. O'zbek va rus harflari qamrab olingan. */
const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'sch', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya',
  ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h',
}

/** O'zbek tilida `o'`/`g'` uchun ishlatiladigan barcha apostrof ko'rinishlari */
const APOSTROPHES = /['‘’ʻʼ`´]/g

export function slugify(input: string): string {
  const lower = input.toLowerCase()

  let out = ''
  for (const ch of lower) {
    out += CYRILLIC[ch] ?? ch
  }

  return out
    .replace(APOSTROPHES, '')        // o'quv -> oquv
    .normalize('NFD')                 // diakritikani ajratish
    .replace(/[̀-ͯ]/g, '')  // va olib tashlash
    .replace(/[^a-z0-9]+/g, '-')      // qolgan hammasi chiziqcha
    .replace(/^-+|-+$/g, '')          // chetlardagi chiziqchalar
    .replace(/-{2,}/g, '-')           // takroriy chiziqchalar
    .slice(0, 80)                     // ustun uzunligiga sig'sin
    .replace(/-+$/, '')               // kesishdan keyin chiziqcha qolmasin
}

/**
 * Band bo'lmagan slug qaytaradi.
 *
 * `isTaken` bazaga qaraydi. Band bo'lsa `-2`, `-3` … qo'shiladi: bu
 * identifikator qo'shishdan ko'ra o'qilishi oson va bir xil nomli ikkita
 * kurs bo'lishi mumkin.
 */
export async function uniqueSlug(
  title: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(title) || 'kurs'
  if (!(await isTaken(base))) return base

  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`
    if (!(await isTaken(candidate))) return candidate
  }
  // Amalda yetib bo'lmaydigan holat — baribir noyob qiymat qaytariladi
  return `${base}-${Date.now()}`
}
