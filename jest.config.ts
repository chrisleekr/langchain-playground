import { pathsToModuleNameMapper } from 'ts-jest';
import { Config } from 'jest';

import fs from 'fs';
const compilerOptions = JSON.parse(fs.readFileSync('./tsconfig.json', 'utf8')).compilerOptions;

const config: Config = {
  setupFiles: ['dotenv/config'],
  globalSetup: '<rootDir>/test/globalSetup.ts',
  globalTeardown: '<rootDir>/test/globalTeardown.ts',
  testTimeout: 10000,
  transform: {
    // Use @swc/jest for faster TypeScript transformation
    '^.+\\.ts$': [
      '@swc/jest',
      {
        jsc: {
          parser: {
            syntax: 'typescript',
            decorators: true
          },
          target: 'es2022'
        }
      }
    ],
    // Transform ESM packages (.mjs files) using babel-jest
    '^.+\\.mjs$': 'babel-jest'
  },
  setupFilesAfterEnv: ['<rootDir>/test/jest.setup.ts'],
  bail: true,
  testEnvironment: 'node',
  testPathIgnorePatterns: ['<rootDir>/src/config/', '<rootDir>/node_modules/', '<rootDir>/dist/', '<rootDir>/coverage/', '<rootDir>/data/'],
  // Prevent Jest from finding mocks/modules in the data directory (cloned external repos)
  modulePathIgnorePatterns: ['<rootDir>/data/'],
  // Transform ESM packages that Jest can't handle natively
  transformIgnorePatterns: ['node_modules/(?!(@toon-format/toon)/)'],
  modulePaths: [compilerOptions.baseUrl],
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths),
  // Only look for tests in src and test directories, excludes data/
  roots: ['<rootDir>/src', '<rootDir>/test'],
  moduleFileExtensions: ['ts', 'js', 'mjs'],
  moduleDirectories: ['node_modules', '<rootDir>'],
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  collectCoverageFrom: ['**/*.ts', '!jest.config.ts', '!**/src/config/**', '!**/__tests__/**', '!**/node_modules/**', '!**/coverage/**', '!test/**'],
  coverageDirectory: 'coverage',
  coverageReporters: ['json', 'lcov', 'text-summary', 'html'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  }
};

export default config;
