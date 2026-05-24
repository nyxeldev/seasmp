import Redis from 'ioredis'
import { env } from './env'
import { logger } from './logger'

// ── In-memory Redis for local dev when Docker is unavailable ──────────────────
class MemRedis {
  private kv   = new Map<string, { v: string; exp?: number }>()
  private sets = new Map<string, Set<string>>()

  private alive(k: string) {
    const e = this.kv.get(k)
    if (!e) return false
    if (e.exp && Date.now() > e.exp) { this.kv.delete(k); return false }
    return true
  }

  // ── String ops ──────────────────────────────────────────────────────────────
  async get(k: string) { return this.alive(k) ? this.kv.get(k)!.v : null }
  async set(k: string, v: string) { this.kv.set(k, { v }); return 'OK' as const }
  async setex(k: string, sec: number, v: string) {
    this.kv.set(k, { v, exp: Date.now() + sec * 1000 })
    return 'OK' as const
  }
  async del(...keys: string[]) {
    let n = 0
    for (const k of keys) {
      if (this.kv.delete(k) || this.sets.delete(k)) n++
    }
    return n
  }
  async incr(k: string) {
    const cur = this.alive(k) ? parseInt(this.kv.get(k)!.v, 10) : 0
    const next = cur + 1
    const exp = this.kv.get(k)?.exp
    this.kv.set(k, { v: String(next), ...(exp ? { exp } : {}) })
    return next
  }
  async expire(k: string, sec: number) {
    const e = this.kv.get(k)
    if (e) { e.exp = Date.now() + sec * 1000; return 1 }
    const s = this.sets.get(k)
    if (s) {
      // store expiry separately for sets — simple approach: ignore for mem impl
      return 1
    }
    return 0
  }
  async ttl(k: string) {
    const e = this.kv.get(k)
    if (!e?.exp) return -1
    const r = Math.ceil((e.exp - Date.now()) / 1000)
    return r > 0 ? r : -2
  }
  async ping() { return 'PONG' as const }

  // ── Set ops (used by checkMultiDevice / removeSessionIp) ────────────────────
  async sadd(k: string, ...members: string[]) {
    if (!this.sets.has(k)) this.sets.set(k, new Set())
    const s = this.sets.get(k)!
    let added = 0
    for (const m of members) if (!s.has(m)) { s.add(m); added++ }
    return added
  }
  async scard(k: string) { return this.sets.get(k)?.size ?? 0 }
  async srem(k: string, ...members: string[]) {
    const s = this.sets.get(k)
    if (!s) return 0
    let removed = 0
    for (const m of members) if (s.delete(m)) removed++
    return removed
  }

  // ── Pipeline stub — checkRateLimit is never called, just needs to type-check ─
  pipeline() {
    const pipe = {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      zremrangebyscore: (..._: any[]) => pipe,
      zadd:             (..._: any[]) => pipe,
      zcard:            (..._: any[]) => pipe,
      expire:           (..._: any[]) => pipe,
      exec: async () => [[null, 0], [null, 0], [null, 0], [null, 0]] as [null, number][],
    }
    return pipe
  }

  disconnect() { /* no-op */ }
}

// ── Type covering every Redis call in the codebase ───────────────────────────
type RedisLike = {
  get(k: string): Promise<string | null>
  set(k: string, v: string): Promise<'OK'>
  setex(k: string, sec: number, v: string): Promise<'OK'>
  del(...keys: string[]): Promise<number>
  incr(k: string): Promise<number>
  expire(k: string, sec: number): Promise<number>
  ttl(k: string): Promise<number>
  ping(): Promise<string>
  sadd(k: string, ...members: string[]): Promise<number>
  scard(k: string): Promise<number>
  srem(k: string, ...members: string[]): Promise<number>
  pipeline(): ReturnType<MemRedis['pipeline']>
  disconnect(): void
}

// ── SafeRedis: always starts on MemRedis, upgrades to real Redis when available
class SafeRedis implements RedisLike {
  private impl: RedisLike = new MemRedis()

  constructor() {
    if (env.NODE_ENV !== 'development') {
      // Production: real Redis is mandatory
      const r = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: 3,
        retryStrategy: (t) => Math.min(t * 100, 3000),
      })
      r.on('connect', () => logger.info('✅ Redis ulandi'))
      r.on('error',   (e) => logger.error({ msg: 'Redis xatosi', err: e.message }))
      this.impl = r as unknown as RedisLike
      return
    }

    // Development: try real Redis; keep MemRedis if unreachable
    const r = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2500,
      retryStrategy: () => null,
      lazyConnect: true,
    })

    r.connect()
      .then(() => {
        r.on('error', (e) => {
          logger.warn({ msg: 'Redis uzildi — in-memory fallbackga o\'tildi', err: e.message })
          this.impl = new MemRedis()
          // Reconnect attempt — replace impl when Redis comes back
          const retry = new Redis(env.REDIS_URL, {
            maxRetriesPerRequest: 1,
            connectTimeout: 2500,
            retryStrategy: () => null,
            lazyConnect: true,
          })
          retry.connect()
            .then(() => {
              this.impl = retry as unknown as RedisLike
              logger.info('✅ Redis qayta ulandi')
            })
            .catch(() => { /* stay on MemRedis */ })
        })
        this.impl = r as unknown as RedisLike
        logger.info('✅ Redis ulandi')
      })
      .catch(() => {
        logger.warn('⚠️  Redis mavjud emas — in-memory fallback (dev mode)')
        // impl stays as MemRedis
      })
  }

  get(k: string)                          { return this.impl.get(k) }
  set(k: string, v: string)              { return this.impl.set(k, v) }
  setex(k: string, s: number, v: string) { return this.impl.setex(k, s, v) }
  del(...keys: string[])                 { return this.impl.del(...keys) }
  incr(k: string)                        { return this.impl.incr(k) }
  expire(k: string, s: number)           { return this.impl.expire(k, s) }
  ttl(k: string)                         { return this.impl.ttl(k) }
  ping()                                 { return this.impl.ping() }
  sadd(k: string, ...m: string[])        { return this.impl.sadd(k, ...m) }
  scard(k: string)                       { return this.impl.scard(k) }
  srem(k: string, ...m: string[])        { return this.impl.srem(k, ...m) }
  pipeline()                             { return this.impl.pipeline() }
  disconnect()                           { this.impl.disconnect() }
}

export const redis = new SafeRedis()
