/** @type {import('jest').Config} */
const base = {
  preset:          'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: { module: 'commonjs', esModuleInterop: true },
      diagnostics: false,
    }],
    // @fastify/static pins an ESM-only content-disposition (type: module).
    // Jest's CJS module registry can't require() that file as-is, so it
    // needs transpiling to CommonJS like any other source file.
    // (`transform` keys are matched against the raw filename with no
    // path-separator normalization, unlike transformIgnorePatterns — use
    // `.` instead of an explicit slash so this matches on Windows too.)
    'content-disposition.dist.+\\.js$': ['babel-jest', {
      babelrc:    false,
      configFile: false,
      plugins:    ['@babel/plugin-transform-modules-commonjs'],
    }],
  },
  // Default is ['/node_modules/'] (transform nothing under node_modules).
  // Carve out the one ESM package that needs transpiling; everything else
  // keeps being skipped.
  transformIgnorePatterns: [
    'node_modules/(?!(@fastify/static/node_modules/)?content-disposition/)',
  ],
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
      setupFiles:  ['<rootDir>/src/tests/setup.integration.ts'],
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
