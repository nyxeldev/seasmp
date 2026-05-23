/** @type {import('jest').Config} */
const base = {
  preset:          'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: { module: 'commonjs', esModuleInterop: true },
      diagnostics: false,
    }],
  },
  clearMocks: true,
}

module.exports = {
  projects: [
    // ── Unit tests (mocked DB / Redis) ─────────────────────────────────────────
    {
      ...base,
      displayName: 'unit',
      roots:       ['<rootDir>/src/tests'],
      testMatch:   ['**/*.test.ts'],
      testPathIgnorePatterns: ['/node_modules/', '/src/tests/integration/'],
      setupFiles:  ['<rootDir>/src/tests/setup.ts'],
    },
    // ── Integration tests (real DB + Redis) ────────────────────────────────────
    {
      ...base,
      displayName: 'integration',
      roots:       ['<rootDir>/src/tests/integration'],
      testMatch:   ['**/*.integration.test.ts'],
      setupFiles:  ['<rootDir>/src/tests/setup.ts'],
    },
  ],
  testTimeout: 30000,
  // Coverage from both suites combined
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/tests/**',
    '!src/config/prisma.ts',
    '!src/server.ts',
  ],
  coverageThreshold: {
    global: { lines: 70, functions: 70, branches: 60 },
  },
}
