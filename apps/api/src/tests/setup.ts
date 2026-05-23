// Set required env vars before any module imports
process.env.DATABASE_URL       = 'postgresql://postgres:1111@localhost:5432/seasmp_db'
process.env.REDIS_URL          = 'redis://:Redis2026!@localhost:6379'
process.env.JWT_ACCESS_SECRET  = 'test-access-secret-that-is-long-enough-for-zod'
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-for-zod'
process.env.AES_ENCRYPTION_KEY = 'b7dcb02c6342b24134b3a09db4d897c16df22aa9034a757d4d0028118159a756'
process.env.NODE_ENV           = 'test'
