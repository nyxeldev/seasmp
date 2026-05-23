FROM python:3.13-slim AS builder
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.13-slim AS runner
WORKDIR /app

RUN addgroup --system seasmp && adduser --system --ingroup seasmp seasmp

COPY --from=builder /install /usr/local
COPY . .

RUN mkdir -p model && chown -R seasmp:seasmp /app
USER seasmp

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/health')" || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5000"]
