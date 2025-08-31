import { pathsToModuleNameMapper } from 'ts-jest';
import { Config } from 'jest';

import fs from 'fs';
const compilerOptions = JSON.parse(fs.readFileSync('./tsconfig.json', 'utf8')).compilerOptions;

const config: Config = {
  setupFiles: ['dotenv/config'],
  globalSetup: '<rootDir>/test/globalSetup.ts',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.test.json'
      }
    ]
  },
  setupFilesAfterEnv: ['<rootDir>/test/jest.setup.ts'],
  bail: true,
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['<rootDir>/src/config/', '<rootDir>/node_modules/', '<rootDir>/dist/', '<rootDir>/coverage/'],
  modulePaths: [compilerOptions.baseUrl],
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths),
  roots: ['<rootDir>'],
  moduleFileExtensions: ['ts', 'js'],
  moduleDirectories: ['node_modules', '<rootDir>'],
  reporters: [
    [
      'default',
      {
        collectCoverage: true,
        collectCoverageFrom: ['**/*.ts'],
        coverageDirectory: 'coverage',
        coverageReporters: ['json', 'lcov', 'text-summary']
      }
    ]
  ],
  clearMocks: true,
  resetMocks: true,
  collectCoverageFrom: ['**/*.ts', '!jest.config.ts', '!**/src/config/**', '!**/__tests__/**', '!**/node_modules/**', '!**/coverage/**', '!test/**']
};

export default config;
