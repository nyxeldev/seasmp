FROM python:3.13-slim AS builder
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.13-slim AS runner
WORKDIR /app

RUN addgroup --system seasmp && adduser --system --ingroup seasmp seasmp

COPY --from=builder /install /usr/local
COPY . .

# `ml/models` image ichida BO'SH holda, lekin seasmp egaligida yaratiladi.
#
# Docker yangi nomli volume'ni image'dagi o'sha yo'l mazmuni bilan to'ldiradi
# va egalikni ham o'shandan oladi. Papka image'da bo'lmasa, ulanish nuqtasi
# root egaligida yaratiladi va konteyner (USER seasmp) modelni saqlay olmaydi:
#   PermissionError: [Errno 13] ... 'ml/models/dropout_model_v....pkl'
#
# Ilgari bu ishlab turardi, lekin tasodifan: .dockerignore eski `model/*.pkl`
# yo'lini to'sardi, shuning uchun dasturchining mahalliy `ml/models/` papkasi
# image'ga ko'chib, egalikni ham o'zi bilan olib kelardi.
RUN mkdir -p ml/models && chown -R seasmp:seasmp /app
USER seasmp

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/health')" || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5000"]
