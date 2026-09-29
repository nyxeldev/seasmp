-- ═══════════════════════════════════════════════════════════════════════════
-- Kurslar uchun slug — manzil qatorida UUID o'rniga o'qilishi mumkin bo'lgan qism
--
-- Ustun avval NULL bo'lishi mumkin holda qo'shiladi, mavjud qatorlar sarlavhadan
-- to'ldiriladi, so'ng NOT NULL va UNIQUE bo'ladi. Shu tartib bo'lmasa, ichida
-- ma'lumot bor jadvalga NOT NULL ustun qo'shib bo'lmaydi.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "courses" ADD COLUMN "slug" VARCHAR(100);

-- Sarlavhani slugga aylantirish. Bu funksiya faqat shu migratsiya uchun —
-- ish vaqtidagi mantiq `src/lib/slug.ts` da, ikkalasi bir xil qoidaga amal qiladi:
--   kichik harf → apostroflarni olib tashlash → qolganini chiziqchaga → siqish
CREATE OR REPLACE FUNCTION pg_temp.slugify(src text) RETURNS text AS $$
  SELECT trim(both '-' from
    regexp_replace(
      regexp_replace(
        -- o'zbekcha apostroflarning barcha ko'rinishi: ' ‘ ’ ʻ ʼ ` ´
        regexp_replace(lower(src), '[''\u2018\u2019\u02BB\u02BC`´]', '', 'g'),
        '[^a-z0-9]+', '-', 'g'
      ),
      '-{2,}', '-', 'g'
    )
  );
$$ LANGUAGE sql IMMUTABLE;

-- To'ldirish. Bir xil slug chiqsa oxiriga tartib raqami qo'shiladi, shunda
-- quyidagi UNIQUE indeks buzilmaydi.
DO $$
DECLARE
  r        RECORD;
  base     text;
  final    text;
  n        int;
BEGIN
  FOR r IN SELECT id, title FROM "courses" ORDER BY "created_at" LOOP
    base := left(pg_temp.slugify(r.title), 80);
    IF base = '' OR base IS NULL THEN
      base := 'kurs';
    END IF;

    final := base;
    n := 1;
    WHILE EXISTS (SELECT 1 FROM "courses" WHERE "slug" = final) LOOP
      n := n + 1;
      final := base || '-' || n;
    END LOOP;

    UPDATE "courses" SET "slug" = final WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE "courses" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "courses_slug_key" ON "courses"("slug");
