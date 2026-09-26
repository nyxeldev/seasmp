#!/usr/bin/env bash
#
# Loyihani boshqa kompyuterga ko'chirish.
#
# Repoda turmagan, lekin loyihaning ishlashi uchun kerak bo'lgan narsalar:
#   - .env               — sirlar. Muhimi: AES_ENCRYPTION_KEY bazadagi 2FA
#                          maxfiy kalitlarini shifrlaydi, shuning uchun baza
#                          nusxasi bilan BIR XIL kalit ko'chishi shart.
#   - postgres_data      — baza: migratsiyalar, namoyish ma'lumoti, audit
#                          jurnali, xavfsizlik ogohlantirishlari.
#   - analytics_models   — o'qitilgan ML modeli (latest_model.pkl va h.k.).
#                          Buni ko'chirmasa ham bo'ladi — yangi joyda qayta
#                          o'qitish mumkin, lekin o'shanda AUC boshqacha chiqadi.
#
# Redis ko'chirilmaydi: unda faqat sessiya, rate-limit hisoblagichlari va
# xatti-harakat oynalari turadi — hammasi qayta yig'iladi.
#
# Ishlatish:
#   ./scripts/migrate-machine.sh export [papka]   # eski kompyuterda
#   ./scripts/migrate-machine.sh import [papka]   # yangi kompyuterda
#
# Standart papka: ../seasmp-transfer

set -euo pipefail

CMD="${1:-}"
DIR="${2:-../seasmp-transfer}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PG_VOL="seasmp_postgres_data"
ML_VOL="seasmp_analytics_models"

die()  { echo "XATO: $*" >&2; exit 1; }
info() { echo "  $*"; }

need_docker() {
  command -v docker >/dev/null 2>&1 || die "docker topilmadi"
  docker info >/dev/null 2>&1 || die "Docker ishlamayapti — Docker Desktop'ni yoqing"
}

# .env dagi bitta qiymatni o'qiydi (qo'shtirnoqlarni olib tashlab).
env_val() {
  grep -m1 "^$1=" .env | sed -e "s/^$1=//" -e 's/^"//' -e 's/"$//'
}

# Git Bash (MSYS) docker argumentlaridagi yo'llarni o'zi "tuzatadi" va
# "-v /c/x:/to" dagi ikkala tomonni ham aylantirib yuboradi — natijada
# konteyner ichidagi /to buziladi. Shuning uchun host yo'lini o'zimiz
# Windows ko'rinishiga keltiramiz va MSYS_NO_PATHCONV bilan aralashuvni
# to'xtatamiz. Linux va macOS da cygpath yo'q — yo'l o'zgarishsiz qoladi.
host_path() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi
}

# ── Eksport ───────────────────────────────────────────────────────────────────
do_export() {
  need_docker
  [ -f .env ] || die ".env topilmadi — sirlarsiz ko'chirishdan ma'no yo'q"

  mkdir -p "$DIR"
  local out
  out="$(cd "$DIR" && pwd)"
  echo "Eksport: $out"

  info ".env"
  cp .env "$out/.env"

  # Bazani ishlab turgan konteyner ichidan olamiz — shunda mahalliy psql
  # o'rnatilgan bo'lishi shart emas va versiya ham albatta mos keladi.
  info "baza (pg_dump)"
  docker ps --format '{{.Names}}' | grep -qx seasmp-postgres \
    || die "seasmp-postgres ishlamayapti. Avval: docker compose up -d postgres"
  docker exec seasmp-postgres pg_dump \
      -U "$(env_val POSTGRES_USER)" \
      -d "$(env_val POSTGRES_DB)" \
      --clean --if-exists --no-owner --no-privileges \
    > "$out/database.sql"

  info "ML modeli"
  if docker volume inspect "$ML_VOL" >/dev/null 2>&1; then
    MSYS_NO_PATHCONV=1 docker run --rm \
      -v "$ML_VOL":/from -v "$(host_path "$out")":/to alpine \
      sh -c 'tar czf /to/analytics_models.tar.gz -C /from .'
  else
    echo "     (volume yo'q — o'tkazib yuborildi, yangi joyda qayta o'qitiladi)"
  fi

  info "manifest"
  {
    echo "SEASMP ko'chirish to'plami"
    echo "yaratilgan : $(date '+%Y-%m-%d %H:%M:%S')"
    echo "shox       : $(git rev-parse --abbrev-ref HEAD)"
    echo "commit     : $(git rev-parse HEAD)"
    echo "baza hajmi : $(du -h "$out/database.sql" | cut -f1)"
  } > "$out/MANIFEST.txt"

  echo
  echo "Tayyor: $out"
  ls -la "$out" | tail -n +2
  echo
  echo "Bu papkada OCHIQ SIRLAR bor (.env). Ochiq kanal bilan yubormang —"
  echo "USB, yoki parol bilan arxivlab jo'nating."
}

# ── Import ────────────────────────────────────────────────────────────────────
do_import() {
  need_docker
  local in
  in="$(cd "$DIR" && pwd)" || die "$DIR topilmadi"
  [ -f "$in/.env" ] || die "$in/.env topilmadi"
  [ -f "$in/database.sql" ] || die "$in/database.sql topilmadi"

  echo "Import: $in"
  [ -f "$in/MANIFEST.txt" ] && { echo; cat "$in/MANIFEST.txt"; echo; }

  # Mavjud .env ni yo'q qilib yubormaymiz.
  if [ -f .env ] && ! cmp -s .env "$in/.env"; then
    local bak=".env.oldmachine_$(date +%s)"
    cp .env "$bak"
    info "mavjud .env saqlandi: $bak"
  fi
  info ".env"
  cp "$in/.env" .env

  info "postgres va redis ko'tarilmoqda"
  docker compose up -d postgres redis

  # Healthcheck kutamiz — pg_isready dan oldin restore qilsak yiqiladi.
  info "baza tayyor bo'lishini kutish"
  local i
  for i in $(seq 1 60); do
    if [ "$(docker inspect -f '{{.State.Health.Status}}' seasmp-postgres 2>/dev/null)" = healthy ]; then
      break
    fi
    sleep 2
    [ "$i" = 60 ] && die "postgres 2 daqiqada tayyor bo'lmadi"
  done

  info "baza tiklanmoqda"
  # Dump --clean --if-exists bilan olingan, shuning uchun mavjud jadvallar
  # ustiga tushadi. Xatolarni jimgina yutmaymiz.
  docker exec -i seasmp-postgres psql \
      -U "$(env_val POSTGRES_USER)" \
      -d "$(env_val POSTGRES_DB)" \
      -v ON_ERROR_STOP=1 \
    < "$in/database.sql" > /dev/null

  if [ -f "$in/analytics_models.tar.gz" ]; then
    info "ML modeli"
    docker volume create "$ML_VOL" >/dev/null
    MSYS_NO_PATHCONV=1 docker run --rm \
      -v "$ML_VOL":/to -v "$(host_path "$in")":/from alpine \
      sh -c 'tar xzf /from/analytics_models.tar.gz -C /to'
  else
    echo "     ML modeli to'plamda yo'q — keyin o'qitish kerak:"
    echo "     curl -X POST http://localhost:5000/v1/analytics/train"
  fi

  info "analytics quriladi va ko'tariladi"
  docker compose up -d --build analytics

  echo
  echo "Baza va model joyida. Qolgani:"
  echo "  npm ci"
  echo "  npm --workspace apps/api run db:generate"
  echo "  npm run dev:api    # alohida terminalda"
  echo "  npm run dev:web    # alohida terminalda"
}

case "$CMD" in
  export) do_export ;;
  import) do_import ;;
  *) sed -n '2,28p' "${BASH_SOURCE[0]}" | sed -e 's/^# \{0,1\}//'; exit 1 ;;
esac
