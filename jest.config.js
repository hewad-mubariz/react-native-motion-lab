/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['**/src/geometry/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      // Override expo/tsconfig.base so ts-jest doesn't choke on RN-specific
      // settings (jsx: react-native, etc.).  Geometry is plain TypeScript.
      tsconfig: {
        strict: true,
        esModuleInterop: true,
        types: ['jest'],
      },
    }],
  },
};
